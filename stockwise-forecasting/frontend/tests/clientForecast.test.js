import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDaily, detectColumns, forecastSeries, parseCSV } from '../lib/clientForecast.js';

function synthCSV(days = 200, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const lines = ['order_date,region,units_sold'];
  const start = Date.parse('2025-01-01T00:00:00Z');
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * 86400000);
    const dow = d.getUTCDay();
    const base = 100 * [1.0, 0.8, 0.85, 0.9, 1.0, 1.4, 1.5][dow] * (1 + i / 800);
    lines.push(`${d.toISOString().slice(0, 10)},North,${Math.round(base + (rnd() - 0.5) * 24)}`);
  }
  return lines.join('\n');
}

test('detects date, value and group columns', () => {
  const parsed = parseCSV(synthCSV(60));
  const cols = detectColumns(parsed);
  assert.equal(cols.date, 'order_date');
  assert.equal(cols.value, 'units_sold');
  assert.deepEqual(cols.groups, []); // a single-valued text column is not a useful group
});

test('fills missing days with zero and aggregates duplicates', () => {
  const rows = [
    { d: '2025-01-01', v: '5' },
    { d: '2025-01-01', v: '7' },
    { d: '2025-01-04', v: '3' },
  ];
  const daily = buildDaily(rows, { date: 'd', value: 'v' });
  assert.deepEqual(daily.values, [12, 0, 0, 3]);
});

test('Holt-Winters beats seasonal naive on weekly-seasonal noisy data and returns sane output', () => {
  const parsed = parseCSV(synthCSV(240));
  const daily = buildDaily(parsed.rows, { date: 'order_date', value: 'units_sold' });
  const out = forecastSeries(daily);
  assert.equal(out.future.mean.length, 28);
  assert.ok(out.future.mean.every((v) => Number.isFinite(v) && v >= 0));
  assert.ok(out.future.lo.every((v, i) => v <= out.future.mean[i] && out.future.mean[i] <= out.future.hi[i]));
  assert.ok(out.holdout.wape_model < out.holdout.wape_naive, `${out.holdout.wape_model} vs ${out.holdout.wape_naive}`);
  assert.equal(out.future.dates[0], '2025-08-29');
});

test('rejects too-short series with a clear message', () => {
  const daily = { dates: Array.from({ length: 10 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`), values: Array(10).fill(5) };
  assert.throws(() => forecastSeries(daily), /4 weeks/);
});

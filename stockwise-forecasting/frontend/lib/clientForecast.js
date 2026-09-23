// A small, honest in-browser forecaster for uploaded CSVs: additive Holt-Winters (weekly season)
// versus a seasonal-naive baseline, scored on the last 28 days as a hold-out.
import Papa from 'papaparse';

const HORIZON = 28;
const PERIOD = 7;

function toISO(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); // dd/mm/yyyy or mm/dd/yyyy: only accept when unambiguous
  if (m2 && Number(m2[1]) > 12) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  if (m2 && Number(m2[2]) > 12) return `${m2[3]}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  return null;
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[,$₹€£\s]/g, ''));
  return String(v ?? '').trim() === '' || Number.isNaN(n) ? null : n;
};

export function parseCSV(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' });
  const fields = (res.meta.fields || []).filter(Boolean);
  if (!fields.length || !res.data.length) throw new Error('No rows found. Upload a CSV with a header row.');
  return { fields, rows: res.data };
}

export function detectColumns({ fields, rows }) {
  const sample = rows.slice(0, 300);
  const frac = (f, test) => sample.filter((r) => test(r[f])).length / Math.max(sample.length, 1);
  const date = fields.find((f) => frac(f, (v) => toISO(v) !== null) >= 0.9) || null;
  const numeric = fields.filter((f) => f !== date && frac(f, (v) => num(v) !== null) >= 0.9);
  const hint = /sales|units|qty|quantity|demand|orders|revenue|amount|count/i;
  const value = numeric.find((f) => hint.test(f)) || numeric.find((f) => !/id$/i.test(f)) || numeric[0] || null;
  const groups = fields.filter((f) => {
    if (f === date || f === value) return false;
    const distinct = new Set(sample.map((r) => r[f]));
    return distinct.size > 1 && distinct.size <= 60 && frac(f, (v) => num(v) === null) >= 0.9;
  });
  return { date, value, groups };
}

export function buildDaily(rows, { date, value, group, groupValue }) {
  const byDay = new Map();
  for (const r of rows) {
    if (group && groupValue != null && r[group] !== groupValue) continue;
    const d = toISO(r[date]);
    const v = num(r[value]);
    if (!d || v === null) continue;
    byDay.set(d, (byDay.get(d) || 0) + v);
  }
  if (!byDay.size) throw new Error('No usable rows after reading the date and value columns.');
  const days = [...byDay.keys()].sort();
  const out = { dates: [], values: [] };
  let t = Date.parse(days[0] + 'T00:00:00Z');
  const end = Date.parse(days[days.length - 1] + 'T00:00:00Z');
  for (; t <= end; t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    out.dates.push(iso);
    out.values.push(byDay.get(iso) || 0); // days with no rows are treated as zero demand
  }
  return out;
}

function runHW(values, alpha, gamma) {
  const p = PERIOD;
  const n = values.length;
  let level = values.slice(0, p).reduce((a, b) => a + b, 0) / p;
  const season = values.slice(0, p).map((v) => v - level);
  let sse = 0;
  let count = 0;
  const resid = [];
  for (let t = p; t < n; t++) {
    const pred = level + season[t % p];
    const e = values[t] - pred;
    sse += e * e;
    count++;
    resid.push(e);
    const newLevel = alpha * (values[t] - season[t % p]) + (1 - alpha) * level;
    season[t % p] = gamma * (values[t] - newLevel) + (1 - gamma) * season[t % p];
    level = newLevel;
  }
  return { level, season, sse, count, resid };
}

export function fitHW(values) {
  if (values.length < PERIOD * 4) throw new Error('Need at least 4 weeks of daily data to forecast.');
  let best = null;
  for (const alpha of [0.05, 0.1, 0.2, 0.3, 0.5]) {
    for (const gamma of [0.05, 0.1, 0.2, 0.4]) {
      const r = runHW(values, alpha, gamma);
      if (!best || r.sse < best.sse) best = { ...r, alpha, gamma };
    }
  }
  const n = values.length;
  const sigma = Math.sqrt(best.sse / Math.max(best.count, 1));
  return {
    alpha: best.alpha,
    gamma: best.gamma,
    sigma,
    forecast(h) {
      const out = [];
      const lo = [];
      const hi = [];
      for (let k = 1; k <= h; k++) {
        const f = Math.max(0, best.level + best.season[(n + k - 1) % PERIOD]);
        const spread = 1.2816 * sigma * Math.sqrt(1 + (k - 1) * best.alpha * best.alpha);
        out.push(f);
        lo.push(Math.max(0, f - spread));
        hi.push(f + spread);
      }
      return { mean: out, lo, hi };
    },
  };
}

export function seasonalNaive(values, h) {
  const last = values.slice(-PERIOD);
  return Array.from({ length: h }, (_, i) => last[i % PERIOD]);
}

const wapeOf = (y, f) => {
  const tot = y.reduce((a, b) => a + Math.abs(b), 0);
  return tot ? y.reduce((a, v, i) => a + Math.abs(v - f[i]), 0) / tot : null;
};

export function addDays(iso, k) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10);
}

export function forecastSeries(daily, horizon = HORIZON) {
  const { dates, values } = daily;
  if (values.length < PERIOD * 4) throw new Error('Need at least 4 weeks of daily data to forecast.');
  const canHold = values.length >= HORIZON + PERIOD * 4;
  let holdout = null;
  if (canHold) {
    const train = values.slice(0, -HORIZON);
    const actual = values.slice(-HORIZON);
    const fit = fitHW(train);
    const fc = fit.forecast(HORIZON);
    const naive = seasonalNaive(train, HORIZON);
    holdout = {
      days: HORIZON,
      wape_model: wapeOf(actual, fc.mean),
      wape_naive: wapeOf(actual, naive),
      coverage80: actual.filter((y, i) => y >= fc.lo[i] && y <= fc.hi[i]).length / HORIZON,
    };
  }
  const fit = fitHW(values);
  const fc = fit.forecast(horizon);
  const last = dates[dates.length - 1];
  return {
    history: { dates, values },
    future: { dates: Array.from({ length: horizon }, (_, i) => addDays(last, i + 1)), ...fc, naive: seasonalNaive(values, horizon) },
    holdout,
    params: { alpha: fit.alpha, gamma: fit.gamma },
  };
}

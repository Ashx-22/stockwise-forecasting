import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate } from '../lib/sim.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'));

test('JS simulator agrees with the Python business.json at the default costs', () => {
  const series = read('series');
  const business = read('business');
  const res = simulate(series, business.holding, business.stockout);
  assert.ok(Math.abs(res.tau - business.critical_ratio) < 1e-9);
  for (const [id, py] of Object.entries(business.policies)) {
    const js = res.policies[id];
    // series.json is rounded to one decimal, so allow a small relative tolerance
    assert.ok(Math.abs(js.cost - py.cost) / py.cost < 0.01, `${id}: js ${js.cost} vs py ${py.cost}`);
    assert.ok(Math.abs(js.fill_rate - py.fill_rate) < 0.005, `${id} fill rate`);
  }
});

test('higher stockout cost raises the optimal service level and the cost', () => {
  const series = read('series');
  const a = simulate(series, 1, 2);
  const b = simulate(series, 1, 9);
  assert.ok(b.tau > a.tau);
  assert.ok(b.policies.seasonal_naive.cost > a.policies.seasonal_naive.cost);
});

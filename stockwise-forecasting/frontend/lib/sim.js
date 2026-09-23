// Client-side twin of backend/stockwise/business.py. tests/sim.test.js checks it against the Python output.

export const POLICIES = [
  { id: 'seasonal_naive', label: 'Order last week\'s demand', short: 'Seasonal naive' },
  { id: 'ets', label: 'Holt-Winters forecast', short: 'Holt-Winters' },
  { id: 'lightgbm_mean', label: 'LightGBM forecast', short: 'LightGBM' },
  { id: 'lightgbm_quantile', label: 'LightGBM, cost-optimal level', short: 'LightGBM + service level' },
];

export function levelsOf(qObj) {
  return Object.keys(qObj).map(Number).sort((a, b) => a - b);
}

// Linear interpolation across quantile levels for day i; tau is clamped to the available range.
export function interpQ(qObj, levels, i, tau) {
  const t = Math.min(Math.max(tau, levels[0]), levels[levels.length - 1]);
  let hi = levels.findIndex((l) => l >= t);
  if (hi <= 0) return qObj[String(levels[0])][i];
  if (levels[hi] === t) return qObj[String(levels[hi])][i];
  const lo = hi - 1;
  const w = (t - levels[lo]) / (levels[hi] - levels[lo]);
  return qObj[String(levels[lo])][i] * (1 - w) + qObj[String(levels[hi])][i] * w;
}

export function simulate(seriesMap, holding, stockout) {
  const tau = stockout / (stockout + holding);
  const acc = Object.fromEntries(POLICIES.map((p) => [p.id, { cost: 0, over: 0, under: 0, filled: 0 }]));
  let demandTotal = 0;
  for (const s of Object.values(seriesMap)) {
    const b = s.backtest;
    const levels = levelsOf(b.lightgbm_q);
    for (let i = 0; i < b.actual.length; i++) {
      const d = b.actual[i];
      demandTotal += d;
      const orders = {
        seasonal_naive: b.seasonal_naive[i],
        ets: b.ets[i],
        lightgbm_mean: b.lightgbm[i],
        lightgbm_quantile: interpQ(b.lightgbm_q, levels, i, tau),
      };
      for (const p of POLICIES) {
        const o = orders[p.id];
        const over = Math.max(o - d, 0);
        const under = Math.max(d - o, 0);
        const a = acc[p.id];
        a.over += over;
        a.under += under;
        a.filled += Math.min(o, d);
      }
    }
  }
  const policies = {};
  for (const p of POLICIES) {
    const a = acc[p.id];
    policies[p.id] = {
      cost: holding * a.over + stockout * a.under,
      excess_units: a.over,
      short_units: a.under,
      fill_rate: demandTotal ? a.filled / demandTotal : 0,
    };
  }
  return { tau, policies };
}

'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Counter, Reveal, SectionHead, Skeleton } from './ui.js';
import { useData } from '../lib/data.js';
import { fmtDate, fmtPct } from '../lib/format.js';

const COLORS = { seasonal_naive: '#8a92ad', ets: '#ff5d3b', lightgbm: '#3d63f0' };
const FEATURE_LABELS = {
  dow_mean_8w: 'Same weekday, last 8 weeks',
  rmean_28: '28-day average (lagged)',
  rmean_7: '7-day average (lagged)',
  rmean_56: '56-day average (lagged)',
  promo: 'Promotion running',
  item_code: 'Which item',
  store_code: 'Which store',
  lag_364: 'Same day last year',
  lag_28: 'Same weekday, 4 weeks ago',
  doy_sin: 'Time of year (sine)',
  doy_cos: 'Time of year (cosine)',
  holiday: 'Holiday',
  dow: 'Day of week',
  trend_ratio: 'Recent momentum',
  rstd_28: 'Recent volatility',
};

function Bar({ value, max, color, delay = 0 }) {
  const reduce = useReducedMotion();
  return (
    <div className="bar-track">
      <motion.div className="bar-fill" style={{ background: color }} initial={reduce ? false : { width: 0 }} whileInView={{ width: `${Math.max((value / max) * 100, 1.5)}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

export default function Validation() {
  const { data } = useData();
  if (!data) {
    return (
      <section id="validation" className="section tone-cream stack-flat"><div className="wrap"><Skeleton height={320} /></div></section>
    );
  }
  const { leaderboard: lb, features, meta } = data;
  const maxW = Math.max(...lb.metrics.map((m) => m.wape));
  const light = lb.metrics.find((m) => m.model === 'lightgbm');
  const maxF = Math.max(...features.map((f) => f.gain_share));
  return (
    <section id="validation" className="section tone-cream stack-flat">
      <div className="wrap">
        <SectionHead title="Scored on data the model never saw">
          {lb.n_folds} rolling folds of {lb.horizon} days. WAPE is the total absolute error divided by total sales, so lower is better.
        </SectionHead>

        <div className="grid-2">
          <Reveal className="card">
            <h3>Error by model</h3>
            <div className="bars">
              {lb.metrics.map((m, i) => (
                <div key={m.model} className="bar-row">
                  <div className="bar-head">
                    <span>{m.label}</span>
                    <b>{fmtPct(m.wape, 1)}</b>
                  </div>
                  <Bar value={m.wape} max={maxW} color={COLORS[m.model]} delay={i * 0.12} />
                  <small>{m.model === 'seasonal_naive' ? 'The baseline: repeat last week' : `${lb.improvement_vs_baseline_pct[m.model]}% lower error than the baseline`}</small>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal className="card" delay={0.08}>
            <h3>Fold by fold</h3>
            <div className="table-scroll">
              <table className="folds">
                <thead>
                  <tr>
                    <th>Model</th>
                    {meta.folds.slice(0, lb.n_folds).map((f, i) => <th key={f.origin} title={`Trained up to ${f.origin}`}>{fmtDate(f.test_start)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {lb.metrics.map((m) => (
                    <tr key={m.model}>
                      <td><i className="dot" style={{ background: COLORS[m.model] }} /> {m.label}</td>
                      {m.wape_by_fold.map((v, i) => {
                        const best = Math.min(...lb.metrics.map((x) => x.wape_by_fold[i]));
                        return <td key={i} className={v === best ? 'best' : ''}>{fmtPct(v, 1)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">Column headers are the first day of each 28-day test window.</p>
          </Reveal>
        </div>

        <div className="tiles">
          <Reveal className="tile">
            <span>MASE, LightGBM</span>
            <b><Counter value={light.mase} format={(v) => v.toFixed(2)} /></b>
            <small>Below 1.0 means better than repeating last week did on the training data.</small>
          </Reveal>
          <Reveal className="tile" delay={0.06}>
            <span>80% range coverage</span>
            <b><Counter value={light.coverage80 * 100} format={(v) => `${Math.round(v)}%`} /></b>
            <small>Observed share of actuals inside the range. The target is 80%, so the ranges run slightly narrow.</small>
          </Reveal>
          <Reveal className="tile" delay={0.12}>
            <span>Bias, LightGBM</span>
            <b>{light.bias >= 0 ? '+' : ''}{(light.bias * 100).toFixed(1)}%</b>
            <small>Negative means it under-forecasts a little on average.</small>
          </Reveal>
        </div>

        <Reveal className="card wide">
          <h3>What the model leans on</h3>
          <div className="bars compact">
            {features.slice(0, 7).map((f, i) => (
              <div key={f.feature} className="bar-row inline">
                <span>{FEATURE_LABELS[f.feature] || f.feature}</span>
                <Bar value={f.gain_share} max={maxF} color="#3d63f0" delay={i * 0.06} />
                <b>{(f.gain_share * 100).toFixed(0)}%</b>
              </div>
            ))}
          </div>
          <p className="note">Share of total gain in the LightGBM mean model. A drift in one of these inputs is the first thing to check when accuracy drops.</p>
        </Reveal>
      </div>
    </section>
  );
}

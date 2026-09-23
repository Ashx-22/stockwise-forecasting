'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Counter, Reveal, SectionHead, Skeleton } from './ui.js';
import { useData } from '../lib/data.js';
import { POLICIES, simulate } from '../lib/sim.js';
import { fmtNum, fmtPct } from '../lib/format.js';

function Range({ label, hint, value, min, max, step, onChange, format }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="range">
      <span className="range-head"><b>{label}</b><output>{format(value)}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ '--pct': `${pct}%` }} />
      <small>{hint}</small>
    </label>
  );
}

export default function Impact() {
  const { data } = useData();
  const reduce = useReducedMotion();
  const [holding, setHolding] = useState(1);
  const [stockout, setStockout] = useState(4);
  const res = useMemo(() => (data ? simulate(data.series, holding, stockout) : null), [data, holding, stockout]);

  const view = useMemo(() => {
    if (!res) return null;
    const max = Math.max(...POLICIES.map((p) => res.policies[p.id].cost));
    const base = res.policies.seasonal_naive.cost;
    const best = POLICIES.reduce((a, p) => (res.policies[p.id].cost < res.policies[a.id].cost ? p : a), POLICIES[0]);
    return { max, base, best, saving: base ? (base - res.policies[best.id].cost) / base : 0 };
  }, [res]);

  return (
    <section id="impact" className="section tone-blue stack">
      <div className="wrap">
        <SectionHead title="What a better forecast is worth" invert>
          Move the sliders to match your business. Costs are replayed over the most recent 28-day test window for all series.
        </SectionHead>

        {!res ? <Skeleton height={320} /> : (
          <div className="impact">
            <Reveal className="card impact-controls">
              <Range label="Cost of a lost sale" hint="Per unit of demand you could not serve" value={stockout} min={1} max={12} step={0.5} onChange={setStockout} format={(v) => `${v.toFixed(1)}`} />
              <Range label="Cost of unsold stock" hint="Per unit ordered but not sold" value={holding} min={0.25} max={5} step={0.25} onChange={setHolding} format={(v) => `${v.toFixed(2)}`} />
              <div className="callout">
                <span>Cost-optimal service level</span>
                <b>{fmtPct(res.tau, 0)}</b>
                <small>Order enough to meet demand this often. With a cost ratio of {stockout.toFixed(1)} to {holding.toFixed(2)}, that is the {fmtPct(res.tau, 0)} point of the forecast range.</small>
              </div>
            </Reveal>

            <Reveal className="card impact-results" delay={0.08}>
              <div className="results-head">
                <h3>Total cost by ordering policy</h3>
                <div className="saving">
                  <span>{view.best.short} saves</span>
                  <b><Counter key={`${stockout}-${holding}`} value={view.saving * 100} format={(v) => `${Math.round(v)}%`} duration={0.7} /></b>
                  <span>vs repeating last week</span>
                </div>
              </div>
              <div className="policy-list">
                {POLICIES.map((p) => {
                  const r = res.policies[p.id];
                  return (
                    <div key={p.id} className={`policy ${p.id === view.best.id ? 'best' : ''}`}>
                      <div className="policy-head"><span>{p.label}</span><b>{fmtNum(r.cost)}</b></div>
                      <div className="bar-track">
                        <motion.div className="bar-fill" style={{ background: p.id === 'lightgbm_quantile' ? '#3d63f0' : p.id === 'seasonal_naive' ? '#8a92ad' : '#ff5d3b' }} animate={{ width: `${Math.max((r.cost / view.max) * 100, 2)}%` }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }} />
                      </div>
                      <small>{fmtPct(r.fill_rate, 0)} of demand served, {fmtNum(r.excess_units)} units left over, {fmtNum(r.short_units)} units short</small>
                    </div>
                  );
                })}
              </div>
              <p className="note">Point-forecast policies order exactly what they predict. The last policy orders at the cost-optimal quantile of the LightGBM range, which is why it deliberately overstocks when lost sales are expensive.</p>
            </Reveal>
          </div>
        )}
      </div>
    </section>
  );
}

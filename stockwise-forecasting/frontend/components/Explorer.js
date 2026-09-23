'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import LineChart from './LineChart.js';
import { Reveal, SectionHead, Skeleton } from './ui.js';
import { useData } from '../lib/data.js';
import { fmtNum, fmtPct, sum, wape } from '../lib/format.js';
import { fetchLiveForecast, liveEnabled } from '../lib/liveApi.js';

const MODELS = [
  { id: 'seasonal_naive', label: 'Seasonal naive', color: '#8a92ad', dashed: true },
  { id: 'ets', label: 'Holt-Winters', color: '#ff5d3b' },
  { id: 'lightgbm', label: 'LightGBM', color: '#3d63f0' },
];
const nulls = (n) => Array(n).fill(null);

function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} aria-pressed={value === o.value}>
          {value === o.value ? <motion.span layoutId={`seg-${label}`} className="seg-pill" transition={{ type: 'spring', stiffness: 400, damping: 32 }} /> : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function Explorer() {
  const { data } = useData();
  const [store, setStore] = useState('S1');
  const [item, setItem] = useState('I1');
  const [view, setView] = useState('future');
  const [promo, setPromo] = useState(false);
  const [on, setOn] = useState({ seasonal_naive: true, ets: false, lightgbm: true });
  const [live, setLive] = useState(null);

  const key = `${store}-${item}`;
  const s = data?.series?.[key];
  const scenario = promo ? 'promo7' : 'planned';

  useEffect(() => {
    setLive(null);
    if (!liveEnabled || view !== 'future' || !s) return undefined;
    const ctrl = new AbortController();
    fetchLiveForecast({ store, item, scenario, signal: ctrl.signal }).then(setLive).catch(() => setLive(null));
    return () => ctrl.abort();
  }, [store, item, scenario, view, s]);

  const chart = useMemo(() => {
    if (!s) return null;
    const hist = s.history;
    const fut = s.future;
    const bt = s.backtest;
    if (view === 'backtest') {
      const off = hist.dates.length - bt.dates.length;
      const pad = (a) => [...nulls(off), ...a];
      const layers = [{ key: 'actual', label: 'Actual', color: '#111a3a', values: hist.values, width: 2 }];
      MODELS.forEach((m) => on[m.id] && layers.push({ key: m.id, label: m.label, color: m.color, dashed: m.dashed, values: pad(bt[m.id]), width: m.id === 'lightgbm' ? 3 : 2.2 }));
      const bands = on.lightgbm ? [
        { key: 'b90', label: '90% range', color: '#3d63f0', opacity: 0.08, lo: pad(bt.lightgbm_q['0.05']), hi: pad(bt.lightgbm_q['0.95']) },
        { key: 'b80', label: '80% range', color: '#3d63f0', opacity: 0.15, lo: pad(bt.lightgbm_q['0.1']), hi: pad(bt.lightgbm_q['0.9']) },
      ] : [];
      return { xs: hist.dates, layers, bands, marker: off, markerLabel: 'Held-out window', key: `${key}-bt` };
    }
    const tail = 56;
    const hd = hist.dates.slice(-tail);
    const hv = hist.values.slice(-tail);
    const pad = (a) => [...nulls(tail), ...a];
    const useLive = live && live.dates.length === fut.dates.length;
    const mean = useLive ? live.mean : promo ? fut.promo7.lightgbm : fut.lightgbm;
    const q = useLive ? live.q : promo ? fut.promo7.lightgbm_q : fut.lightgbm_q;
    const layers = [{ key: 'actual', label: 'Actual', color: '#111a3a', values: [...hv, ...nulls(fut.dates.length)], width: 2 }];
    MODELS.forEach((m) => {
      if (!on[m.id]) return;
      layers.push({ key: m.id, label: m.label, color: m.color, dashed: m.dashed, width: m.id === 'lightgbm' ? 3 : 2.2, values: pad(m.id === 'lightgbm' ? mean : fut[m.id]) });
    });
    if (promo && on.lightgbm) layers.push({ key: 'planned', label: 'LightGBM without promotion', color: '#3d63f0', dashed: true, width: 1.8, values: pad(fut.lightgbm) });
    const bands = on.lightgbm ? [
      { key: 'b90', label: '90% range', color: '#3d63f0', opacity: 0.08, lo: pad(q['0.05']), hi: pad(q['0.95']) },
      { key: 'b80', label: '80% range', color: '#3d63f0', opacity: 0.15, lo: pad(q['0.1']), hi: pad(q['0.9']) },
    ] : [];
    return { xs: [...hd, ...fut.dates], layers, bands, marker: tail, markerLabel: 'Forecast starts', key: `${key}-f-${scenario}`, mean, useLive };
  }, [s, view, on, promo, live, key, scenario]);

  const stats = useMemo(() => {
    if (!s) return null;
    if (view === 'backtest') {
      const bt = s.backtest;
      const rows = MODELS.map((m) => ({ ...m, wape: wape(bt.actual, bt[m.id]) }));
      const best = rows.reduce((a, b) => (b.wape < a.wape ? b : a));
      return { kind: 'bt', rows, best };
    }
    const last28 = sum(s.history.values.slice(-28));
    const next28 = sum(chart?.mean ?? s.future.lightgbm);
    const planned = sum(s.future.lightgbm);
    const promoUnits = sum(s.future.promo7.lightgbm);
    return { kind: 'f', last28, next28, uplift: promoUnits - planned };
  }, [s, view, chart]);

  const stores = data?.meta.dataset.stores ?? [];
  const items = data?.meta.dataset.items ?? [];

  return (
    <section id="explore" className="section tone-cream stack">
      <div className="wrap">
        <SectionHead title="Explore any store and item">
          Pick a series, then compare what each model predicted against what actually sold, or look 28 days ahead.
        </SectionHead>

        <Reveal className="explorer card">
          <div className="controls">
            <label className="field">
              <span>Store</span>
              <select value={store} onChange={(e) => setStore(e.target.value)} disabled={!data}>
                {stores.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Item</span>
              <select value={item} onChange={(e) => setItem(e.target.value)} disabled={!data}>
                {items.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <Segmented label="View" value={view} onChange={setView} options={[{ value: 'future', label: 'Next 28 days' }, { value: 'backtest', label: 'Backtest' }]} />
            <label className={`switch ${view !== 'future' ? 'is-off' : ''}`}>
              <input type="checkbox" checked={promo} disabled={view !== 'future'} onChange={(e) => setPromo(e.target.checked)} />
              <i aria-hidden="true" />
              <span>7-day promotion from tomorrow</span>
            </label>
          </div>

          <div className="model-toggles" role="group" aria-label="Models shown">
            {MODELS.map((m) => (
              <button key={m.id} className={`toggle ${on[m.id] ? 'on' : ''}`} aria-pressed={on[m.id]} onClick={() => setOn((p) => ({ ...p, [m.id]: !p[m.id] }))}>
                <i style={{ background: m.color }} /> {m.label}
              </button>
            ))}
            {chart?.useLive ? <span className="badge">Live from API</span> : null}
          </div>

          {chart ? (
            <LineChart
              xs={chart.xs}
              layers={chart.layers}
              bands={chart.bands}
              marker={chart.marker}
              markerLabel={chart.markerLabel}
              animateKey={chart.key + JSON.stringify(on)}
              unit=""
              ariaLabel={`Daily units of ${s.item_label} in ${s.store_label}, ${view === 'future' ? 'with a 28 day forecast' : 'with model forecasts over the last 28 days'}`}
            />
          ) : <Skeleton height={340} />}

          {stats?.kind === 'bt' ? (
            <div className="kpis">
              {stats.rows.map((r) => (
                <div key={r.id} className={`kpi ${r.id === stats.best.id ? 'best' : ''}`}>
                  <span>{r.label} error (WAPE)</span>
                  <b>{fmtPct(r.wape, 1)}</b>
                  {r.id === stats.best.id ? <em>lowest for this series</em> : <em>&nbsp;</em>}
                </div>
              ))}
            </div>
          ) : null}
          {stats?.kind === 'f' ? (
            <div className="kpis">
              <div className="kpi"><span>Expected units, next 28 days</span><b>{fmtNum(stats.next28)}</b><em>{promo ? 'with the promotion' : 'planned promotions only'}</em></div>
              <div className="kpi"><span>Actual units, last 28 days</span><b>{fmtNum(stats.last28)}</b><em>{stats.last28 ? `${stats.next28 >= stats.last28 ? '+' : ''}${fmtNum(((stats.next28 - stats.last28) / stats.last28) * 100, 1)}% vs forecast` : ' '}</em></div>
              <div className="kpi"><span>Promotion effect, 7 days</span><b>{stats.uplift >= 0 ? '+' : ''}{fmtNum(stats.uplift)}</b><em>units, model estimate</em></div>
            </div>
          ) : null}
          <p className="note">The shaded bands are the model's 80% and 90% ranges. Hover the chart for daily values. {view === 'backtest' ? 'Backtest forecasts were made using only data available 28 days earlier.' : 'The dashed grey line repeats last week.'}</p>
        </Reveal>
      </div>
    </section>
  );
}

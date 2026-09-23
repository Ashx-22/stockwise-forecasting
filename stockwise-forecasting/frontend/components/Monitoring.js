'use client';

import { motion, useReducedMotion } from 'framer-motion';
import LineChart from './LineChart.js';
import { Reveal, SectionHead, Skeleton } from './ui.js';
import { useData } from '../lib/data.js';
import { fmtDate, fmtPct } from '../lib/format.js';

export default function Monitoring() {
  const { data } = useData();
  const reduce = useReducedMotion();
  if (!data) return <section id="monitor" className="section tone-cream stack"><div className="wrap"><Skeleton height={340} /></div></section>;
  const { drift, meta } = data;
  const injected = (meta.dataset.drift_injected || []).map((d) => `${d.store}-${d.item}`);
  const flagged = drift.drifting_series.map((s) => s.series);
  const caught = flagged.filter((s) => injected.includes(s));
  const falseAlarms = flagged.filter((s) => !injected.includes(s));
  const xs = drift.weeks.map((w) => w.week_start);
  const level = drift.thresholds.wape_alert_level;
  const maxBias = Math.max(...drift.by_series.map((s) => Math.abs(s.bias_pct)), drift.thresholds.bias * 100);
  const attention = drift.status === 'attention';
  const label = (key) => {
    const s = data.series[key];
    return s ? `${s.item_label}, ${s.store_label}` : key;
  };
  return (
    <section id="monitor" className="section tone-cream stack">
      <div className="wrap">
        <SectionHead title="Watching the model after launch">
          A frozen copy of the model is scored week by week on new data, the way it would run in production.
        </SectionHead>
        <div className="grid-2 monitor">
          <Reveal className="card">
            <div className="card-top">
              <h3>Weekly error</h3>
              <span className="legend"><i className="dot dot-blue" /> Frozen model <i className="dot dot-grey" /> Lag-28 baseline <i className="dot dot-coral" /> Alert level</span>
            </div>
            <LineChart
              xs={xs}
              height={280}
              formatX={(s) => fmtDate(s)}
              animateKey="monitor"
              ariaLabel="Weekly WAPE of the frozen model against a lag 28 baseline and the alert level"
              unit=""
              layers={[
                { key: 'base', label: 'Baseline WAPE %', color: '#8a92ad', values: drift.weeks.map((w) => w.wape_baseline * 100), dashed: true, width: 2 },
                { key: 'alert', label: 'Alert level %', color: '#ff5d3b', values: xs.map(() => level * 100), dashed: true, width: 1.6 },
                { key: 'champ', label: 'Frozen model WAPE %', color: '#3d63f0', values: drift.weeks.map((w) => w.wape_champion * 100), width: 3 },
              ]}
            />
            <p className="note">
              Frozen on {fmtDate(drift.freeze_date, true)}. {drift.alerts.length
                ? `The aggregate error crossed the alert level in ${drift.alerts.length} week${drift.alerts.length > 1 ? 's' : ''}.`
                : 'The aggregate error stayed below the alert level, so a dashboard that only watches the total would have shown no alarm.'}
            </p>
          </Reveal>

          <Reveal className="card" delay={0.08}>
            <div className="card-top">
              <h3>Series drifting from the forecast</h3>
              <span className={`status ${attention ? 'warn' : 'ok'}`}>{attention ? 'Needs attention' : 'Healthy'}</span>
            </div>
            <div className="bias-list">
              {drift.by_series.slice(0, 6).map((s, i) => {
                const w = (Math.abs(s.bias_pct) / maxBias) * 50;
                const over = s.bias_pct >= 0;
                const isFlag = flagged.includes(s.series);
                return (
                  <div key={s.series} className="bias-row">
                    <span className="bias-name">{label(s.series)}</span>
                    <div className="bias-axis">
                      <motion.div className={`bias-bar ${over ? 'pos' : 'neg'} ${isFlag ? 'flag' : ''}`} style={{ [over ? 'left' : 'right']: '50%' }} initial={reduce ? false : { width: 0 }} whileInView={{ width: `${w}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }} />
                    </div>
                    <b className={isFlag ? 'flagged' : ''}>{s.bias_pct >= 0 ? '+' : ''}{s.bias_pct.toFixed(0)}%</b>
                  </div>
                );
              })}
            </div>
            <p className="note">
              Last 28 days of actual demand versus the frozen forecast. Series beyond ±{fmtPct(drift.thresholds.bias, 0)} are flagged. {injected.length ? `In this demo, ${injected.length} series were given a demand shock on ${fmtDate(meta.dataset.drift_injected[0].from, true)}. The monitor flagged ${flagged.length} series and caught ${caught.length} of the ${injected.length}, with ${falseAlarms.length} false alarm${falseAlarms.length === 1 ? '' : 's'}.` : `${flagged.length} series flagged.`}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

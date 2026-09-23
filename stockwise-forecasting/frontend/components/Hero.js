'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import LineChart from './LineChart.js';
import { Arrow, Counter, Magnetic, Skeleton } from './ui.js';
import { useData } from '../lib/data.js';
import { fmtPct } from '../lib/format.js';

const EASE = [0.22, 1, 0.36, 1];

function Word({ children, i }) {
  const reduce = useReducedMotion();
  return (
    <span className="word-mask">
      <motion.span className="word" initial={reduce ? false : { y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.15 + i * 0.07 }}>
        {children}
      </motion.span>
    </span>
  );
}

function HeroChart({ data }) {
  const key = data.series['S1-I1'] ? 'S1-I1' : Object.keys(data.series)[0];
  const s = data.series[key];
  const hist = s.history.dates.slice(-42);
  const histVals = s.history.values.slice(-42);
  const xs = [...hist, ...s.future.dates];
  const pad = (a) => [...Array(hist.length).fill(null), ...a];
  const q = s.future.lightgbm_q;
  return (
    <LineChart
      xs={xs}
      height={300}
      marker={hist.length}
      animateKey={`hero-${key}`}
      ariaLabel={`Daily demand for ${s.item_label} in ${s.store_label}: the last 6 weeks and the next 28 days of forecast with an 80 percent range`}
      layers={[
        { key: 'actual', label: 'Actual demand', color: '#111a3a', values: [...histVals, ...Array(s.future.dates.length).fill(null)], width: 2 },
        { key: 'lgbm', label: 'Forecast', color: '#3d63f0', values: pad(s.future.lightgbm), width: 3 },
      ]}
      bands={[{ key: 'b80', label: '80% range', color: '#3d63f0', opacity: 0.16, lo: pad(q['0.1']), hi: pad(q['0.9']) }]}
    />
  );
}

export default function Hero() {
  const { data } = useData();
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const yA = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const yB = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 50]);

  const lb = data?.leaderboard;
  const light = lb?.metrics.find((m) => m.model === 'lightgbm');
  const improvement = lb?.improvement_vs_baseline_pct?.lightgbm;

  return (
    <section id="top" className="hero" ref={ref}>
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 aria-label="Know what to stock before customers ask.">
            <span aria-hidden="true">
              {['Know', 'what', 'to', 'stock'].map((w, i) => (
                <Word key={w} i={i}>{w}</Word>
              ))}
              <br />
              {['before', 'customers', 'ask.'].map((w, i) => (
                <Word key={w} i={i + 4}>{w}</Word>
              ))}
            </span>
          </h1>
          <motion.p className="lead" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.7, ease: EASE }}>
            Stockwise forecasts daily demand for every store and item, shows how sure it is, and tells you what the error is costing you.
          </motion.p>
          <motion.div className="hero-actions" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.7, ease: EASE }}>
            <Magnetic>
              <a className="btn btn-blue" href="#explore">
                Explore the forecasts <Arrow />
              </a>
            </Magnetic>
            <a className="btn btn-ghost" href="#validation">
              How it is validated
            </a>
          </motion.div>
          <p className="fineprint">
            {data ? (data.meta.dataset.synthetic ? 'The demo runs on seeded synthetic data. Swap in your own with one command.' : `Data: ${data.meta.dataset.name}`) : ' '}
          </p>
        </div>

        <motion.div className="hero-visual" initial={reduce ? false : { opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.35, duration: 0.9, ease: EASE }}>
          <div className="card hero-card">
            <div className="card-top">
              <b>Bottled water, Chennai</b>
              <span className="legend"><i className="dot dot-blue" /> Forecast <i className="dot dot-ink" /> Actual</span>
            </div>
            {data ? <HeroChart data={data} /> : <Skeleton height={300} />}
          </div>
          <motion.div className="chip chip-a" style={{ y: yA }}>
            <b>{improvement != null ? <Counter value={improvement} format={(v) => `${Math.round(v)}%`} /> : '-'}</b>
            <span>lower error than the seasonal baseline</span>
          </motion.div>
          <motion.div className="chip chip-b" style={{ y: yB }}>
            <b>{light?.coverage80 != null ? <Counter value={light.coverage80 * 100} format={(v) => `${Math.round(v)}%`} /> : '-'}</b>
            <span>of actuals landed inside the 80% range</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

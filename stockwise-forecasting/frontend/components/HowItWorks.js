'use client';

import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Reveal, SectionHead } from './ui.js';
import { useData } from '../lib/data.js';

const ICONS = {
  data: (
    <svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="12" rx="14" ry="6" /><path d="M10 12v12c0 3.3 6.3 6 14 6s14-2.7 14-6V12M10 24v12c0 3.3 6.3 6 14 6s14-2.7 14-6V24" /></svg>
  ),
  models: (
    <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 36l10-12 8 6 10-16 8 8" /><circle cx="16" cy="24" r="2.5" /><circle cx="24" cy="30" r="2.5" /><circle cx="34" cy="14" r="2.5" /></svg>
  ),
  test: (
    <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="10" width="10" height="28" rx="3" /><rect x="19" y="10" width="10" height="28" rx="3" /><rect x="32" y="10" width="10" height="28" rx="3" /><path d="M6 44h36" /></svg>
  ),
  ship: (
    <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6c8 4 12 12 10 22l-6 6h-8l-6-6C10 18 16 10 24 6z" /><circle cx="24" cy="20" r="4" /><path d="M18 36l-4 6M30 36l4 6" /></svg>
  ),
};

export default function HowItWorks() {
  const { data } = useData();
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 60%'] });
  const line = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const d = data?.meta?.dataset;
  const steps = [
    {
      icon: 'data',
      title: 'Clean data, safe features',
      text: `Daily sales for ${d ? d.n_series : 'every'} store and item series. Every lag is at least 28 days old, so nothing from the future can leak into a forecast.`,
    },
    {
      icon: 'models',
      title: 'Three models, one scoreboard',
      text: 'A seasonal-naive baseline, Holt-Winters, and one global LightGBM with quantile heads that also return a prediction range.',
    },
    {
      icon: 'test',
      title: 'Rolling backtests',
      text: `${data ? data.meta.n_folds : 4} expanding-window folds of ${data ? data.meta.horizon : 28} days each. Each fold trains only on what was known at its origin.`,
    },
    {
      icon: 'ship',
      title: 'Serve and monitor',
      text: 'A FastAPI service behind Docker, experiment tracking with MLflow, and a monitor that watches for accuracy loss and per-series drift.',
    },
  ];
  return (
    <section id="how" className="section tone-blue stack" ref={ref}>
      <div className="wrap">
        <SectionHead title="From raw sales to a forecast you can defend" invert>
          Four stages, each one testable on its own.
        </SectionHead>
        <div className="steps">
          <div className="steps-rail" aria-hidden="true">
            <motion.div className="steps-rail-fill" style={{ scaleX: reduce ? 1 : line }} />
          </div>
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08} className="step">
              <motion.div className="step-icon" whileHover={reduce ? undefined : { rotate: -6, scale: 1.06 }}>{ICONS[s.icon]}</motion.div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

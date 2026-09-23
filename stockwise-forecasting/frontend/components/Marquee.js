'use client';

import { useRef } from 'react';
import { useAnimationFrame, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity, motion } from 'framer-motion';
import { Asterisk } from './ui.js';

const WORDS = ['Forecast', 'Backtest', 'Explain', 'Monitor', 'Ship'];

// A diagonal ribbon that drifts sideways and speeds up while you scroll.
export default function Marquee() {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const dirRef = useRef(1);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const boost = useTransform(smooth, [-2000, 0, 2000], [-4, 0, 4]);
  const xPct = useTransform(x, (v) => `${v}%`);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const v = boost.get();
    if (v !== 0) dirRef.current = v > 0 ? 1 : -1;
    const speed = 0.05 + Math.abs(v) * 0.04;
    let next = x.get() - dirRef.current * speed * delta;
    const loop = 50; // percent: the track holds two identical halves
    if (next <= -loop) next += loop;
    if (next > 0) next -= loop;
    x.set(next);
  });

  const items = Array.from({ length: 4 }, () => WORDS).flat();
  const half = (k) => (
    <div className="ribbon-half" key={k}>
      {items.map((w, i) => (
        <span className="ribbon-item" key={`${k}-${i}`}>
          {w}
          <Asterisk className="ribbon-star" />
        </span>
      ))}
    </div>
  );

  return (
    <div className="ribbon-wrap" aria-hidden="true">
      <div className="ribbon">
        <motion.div className="ribbon-track" style={{ x: xPct }}>
          {half(0)}
          {half(1)}
        </motion.div>
      </div>
    </div>
  );
}

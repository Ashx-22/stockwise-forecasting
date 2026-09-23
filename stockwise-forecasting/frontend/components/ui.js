'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

export function Reveal({ children, delay = 0, y = 26, className, as = 'div' }) {
  const reduce = useReducedMotion();
  const Comp = motion[as] || motion.div;
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}

// Number that counts up the first time it scrolls into view.
export function Counter({ value, format = (v) => Math.round(v).toLocaleString('en-US'), duration = 1.4 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [text, setText] = useState(() => format(0));
  useEffect(() => {
    if (!inView) return undefined;
    if (reduce) {
      setText(format(value));
      return undefined;
    }
    const controls = animate(0, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setText(format(v)) });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce]);
  return <span ref={ref}>{text}</span>;
}

// Wrapper whose child leans slightly towards the cursor.
export function Magnetic({ children, strength = 0.22 }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 220, damping: 16 });
  const y = useSpring(my, { stiffness: 220, damping: 16 });
  const move = (e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const leave = () => {
    mx.set(0);
    my.set(0);
  };
  return (
    <motion.div ref={ref} style={{ x, y, display: 'inline-block' }} onPointerMove={move} onPointerLeave={leave}>
      {children}
    </motion.div>
  );
}

export const Arrow = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const Asterisk = ({ className = '', ...p }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true" {...p}>
    <g stroke="currentColor" strokeWidth="17" strokeLinecap="round">
      <path d="M50 10v80" />
      <path d="M15 30l70 40" />
      <path d="M85 30L15 70" />
    </g>
  </svg>
);

export function SectionHead({ title, children, invert = false }) {
  return (
    <Reveal className={`section-head ${invert ? 'invert' : ''}`}>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </Reveal>
  );
}

export function Skeleton({ height = 240 }) {
  return <div className="skeleton" style={{ height }} aria-busy="true" />;
}

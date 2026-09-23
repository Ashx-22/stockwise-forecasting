'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useWidth } from '../lib/motion.js';
import { fmtDate, fmtNum } from '../lib/format.js';

const M = { t: 14, r: 14, b: 30, l: 44 };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function runs(values) {
  const out = [];
  let cur = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push([i, v]);
  });
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Responsive SVG line chart with animated drawing, uncertainty bands and a hover tooltip.
 * layers: [{key,label,color,values(null allowed),dashed,width}]  bands: [{key,label,color,opacity,lo,hi}]
 */
export default function LineChart({ xs, layers, bands = [], marker, markerLabel = 'Forecast starts', height = 340, ariaLabel, animateKey = '', formatX = (s) => fmtDate(s), unit = '' }) {
  const [ref, width] = useWidth(720);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(null);
  const n = xs.length;
  const iw = Math.max(width - M.l - M.r, 10);
  const ih = height - M.t - M.b;

  const yMax = useMemo(() => {
    const all = [...layers.flatMap((l) => l.values), ...bands.flatMap((b) => b.hi)].filter((v) => v != null && Number.isFinite(v));
    return niceMax(Math.max(...all, 1) * 1.05);
  }, [layers, bands]);

  const x = (i) => M.l + (n > 1 ? (i * iw) / (n - 1) : iw / 2);
  const y = (v) => M.t + ih - (v / yMax) * ih;
  const yTicks = [0, 1, 2, 3, 4].map((k) => (yMax * k) / 4);
  const xTicks = useMemo(() => {
    const count = width < 520 ? 4 : 6;
    return Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1)));
  }, [n, width]);

  const path = (values) => runs(values).map((r) => 'M' + r.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L')).join(' ');
  const bandPath = (b) => {
    const idx = b.hi.map((v, i) => (v != null && b.lo[i] != null ? i : null));
    const segs = runs(idx.map((v) => (v == null ? null : v)));
    return segs
      .map((seg) => {
        const top = seg.map(([i]) => `${x(i).toFixed(1)},${y(b.hi[i]).toFixed(1)}`);
        const bot = [...seg].reverse().map(([i]) => `${x(i).toFixed(1)},${y(b.lo[i]).toFixed(1)}`);
        return `M${top.join('L')}L${bot.join('L')}Z`;
      })
      .join(' ');
  };

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - M.l) / iw) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  };

  const tipLeft = hover == null ? 0 : Math.min(Math.max(x(hover), 90), width - 90);

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="axis">
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="axis">
            {formatX(xs[i])}
          </text>
        ))}
        {marker != null && marker > 0 && marker < n ? (
          <g>
            <line x1={x(marker)} x2={x(marker)} y1={M.t} y2={M.t + ih} className="marker" />
            <text x={x(marker) + 6} y={M.t + 11} className="axis marker-label">
              {markerLabel}
            </text>
          </g>
        ) : null}
        {bands.map((b) => (
          <motion.path key={`${animateKey}-${b.key}`} d={bandPath(b)} fill={b.color} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: b.opacity ?? 0.16 }} transition={{ duration: 0.9, delay: 0.5 }} />
        ))}
        {layers.map((l, k) => (
          <motion.path
            key={`${animateKey}-${l.key}`}
            d={path(l.values)}
            fill="none"
            stroke={l.color}
            strokeWidth={l.width ?? 2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={l.dashed ? '6 6' : undefined}
            initial={reduce ? false : l.dashed ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
            animate={l.dashed ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
            transition={{ duration: l.dashed ? 0.6 : 1.1, ease: 'easeInOut', delay: 0.08 * k }}
          />
        ))}
        {hover != null ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} className="crosshair" />
            {layers.map((l) => (l.values[hover] != null ? <circle key={l.key} cx={x(hover)} cy={y(l.values[hover])} r="4.5" fill={l.color} stroke="#fff" strokeWidth="2" /> : null))}
          </g>
        ) : null}
      </svg>
      {hover != null ? (
        <div className="tip" style={{ left: tipLeft }}>
          <strong>{formatX(xs[hover], true)}</strong>
          {layers.map((l) => (l.values[hover] != null ? (
            <div key={l.key}>
              <i style={{ background: l.color }} /> {l.label}: <b>{fmtNum(l.values[hover], 1)}{unit}</b>
            </div>
          ) : null))}
          {bands.map((b) => (b.hi[hover] != null && b.lo[hover] != null ? (
            <div key={b.key} className="tip-band">
              {b.label}: {fmtNum(b.lo[hover], 0)} to {fmtNum(b.hi[hover], 0)}
            </div>
          ) : null))}
        </div>
      ) : null}
    </div>
  );
}

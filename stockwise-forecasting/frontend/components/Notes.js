'use client';

import { useRef } from 'react';
import { Reveal, SectionHead } from './ui.js';
import { useData } from '../lib/data.js';

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export default function Notes() {
  const { data } = useData();
  const track = useRef(null);
  const light = data?.leaderboard.metrics.find((m) => m.model === 'lightgbm');
  const cards = [
    { icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', title: 'Nothing from the future', text: 'Every feature that uses sales is at least 28 days old. A unit test blanks all sales after the forecast origin and checks the features do not change.' },
    { icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2', title: 'Time-ordered folds', text: `${data?.meta.n_folds ?? 4} expanding-window backtests, each trained only on data before its test window. No random shuffling.` },
    { icon: 'M5 12h14M12 5l7 7-7 7', title: 'A baseline that can win', text: 'Repeat-last-week and Holt-Winters are scored on the same folds. A model is only worth shipping if it beats them by a margin you can state.' },
    { icon: 'M3 12h4l3-8 4 16 3-8h4', title: 'Ranges, not only points', text: light ? `Quantile models give an 80% range. Observed coverage was ${(light.coverage80 * 100).toFixed(0)}%, a little under the target, and the site says so.` : 'Quantile models give an 80% range, with observed coverage reported next to it.' },
    { icon: 'M12 8v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z', title: 'Monitored after launch', text: 'A frozen model is scored weekly. Per-series bias catches a few products drifting while the total still looks fine.' },
  ];
  const scroll = (dir) => track.current?.scrollBy({ left: dir * 340, behavior: 'smooth' });
  return (
    <section id="notes" className="section tone-blue stack">
      <div className="wrap">
        <div className="notes-head">
          <SectionHead title="Design decisions" invert>
            The choices a reviewer should be able to check.
          </SectionHead>
          <div className="arrows">
            <button onClick={() => scroll(-1)} aria-label="Previous cards"><Icon d="M15 5l-7 7 7 7" /></button>
            <button onClick={() => scroll(1)} aria-label="Next cards"><Icon d="M9 5l7 7-7 7" /></button>
          </div>
        </div>
        <div className="carousel" ref={track} tabIndex={0} aria-label="Design decisions">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.06} className="note-card">
              <div className="note-icon"><Icon d={c.icon} /></div>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

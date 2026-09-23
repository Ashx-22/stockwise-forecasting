'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { Asterisk } from './ui.js';
import { site } from '../site.config.js';

const LINKS = [
  { id: 'how', label: 'How it works' },
  { id: 'explore', label: 'Explorer' },
  { id: 'impact', label: 'Impact' },
  { id: 'monitor', label: 'Monitoring' },
  { id: 'try', label: 'Try it' },
];

export default function Nav() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 12);
    setHidden(y > 160 && y > prev && !open);
  });

  useEffect(() => {
    const targets = LINKS.map((l) => document.getElementById(l.id)).filter(Boolean);
    if (!targets.length || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <motion.header className={`nav ${scrolled ? 'is-scrolled' : ''}`} animate={{ y: hidden ? -96 : 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
        <a href="#top" className="logo" aria-label={`${site.name} home`}>
          <span>stock</span>
          <Asterisk className="logo-star" />
          <span>wise</span>
        </a>
        <nav className="nav-links" aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.id} href={`#${l.id}`} className={active === l.id ? 'on' : ''}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="nav-end">
          <a className="btn btn-blue btn-sm" href={site.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button className="menu-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav">
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </motion.header>
      <AnimatePresence>
        {open ? (
          <motion.nav id="mobile-nav" className="mobile-nav" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} aria-label="Mobile sections">
            {LINKS.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </>
  );
}

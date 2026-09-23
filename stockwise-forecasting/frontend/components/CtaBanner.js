'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Arrow, Asterisk, Magnetic } from './ui.js';
import { site } from '../site.config.js';

export default function CtaBanner() {
  const reduce = useReducedMotion();
  return (
    <section className="cta-wrap">
      <motion.div className="cta" initial={reduce ? false : { opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
        <Asterisk className="cta-star" />
        <div>
          <h2>Want to see it on your own numbers?</h2>
          <p>Upload a sales CSV and get a 28-day forecast in your browser, scored against a simple baseline. Nothing is uploaded to a server.</p>
        </div>
        <div className="cta-actions">
          <Magnetic><a className="btn btn-cream" href="#try">Upload a CSV <Arrow /></a></Magnetic>
          <a className="btn btn-outline-dark" href={site.github} target="_blank" rel="noreferrer">Read the code</a>
        </div>
      </motion.div>
    </section>
  );
}

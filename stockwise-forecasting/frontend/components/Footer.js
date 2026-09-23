'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Asterisk } from './ui.js';
import { site } from '../site.config.js';

function Letters({ text, start = 0 }) {
  const reduce = useReducedMotion();
  return text.split('').map((c, i) => (
    <span className="ft-mask" key={`${text}-${i}`}>
      <motion.span className="ft-letter" initial={reduce ? false : { y: '105%' }} whileInView={{ y: 0 }} viewport={{ once: true, margin: '-20px' }} transition={{ duration: 0.8, delay: (start + i) * 0.05, ease: [0.22, 1, 0.36, 1] }}>
        {c}
      </motion.span>
    </span>
  ));
}

export default function Footer() {
  const reduce = useReducedMotion();
  return (
    <footer className="footer tone-blue" id="footer">
      <div className="wrap">
        <div className="ft-word" aria-label="Stockwise">
          <span aria-hidden="true" className="ft-line">
            <Letters text="STOCK" />
            <motion.span className="ft-star" animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}><Asterisk /></motion.span>
            <Letters text="WISE" start={5} />
          </span>
        </div>
        <div className="ft-cols">
          <div>
            <h4>Explore</h4>
            <a href="#explore">Forecast explorer</a>
            <a href="#validation">Validation</a>
            <a href="#impact">Impact</a>
            <a href="#monitor">Monitoring</a>
          </div>
          <div>
            <h4>Project</h4>
            <a href={site.github} target="_blank" rel="noreferrer">Source code</a>
            <a href={site.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="#try">Try it</a>
          </div>
          <div className="ft-about">
            <h4>About</h4>
            <p>Built by {site.author} as an end-to-end forecasting project: features, backtests, API, monitoring and this site. Demo data is synthetic.</p>
          </div>
        </div>
        <div className="ft-base"><span>{site.name} {new Date().getFullYear()}</span><a href="#top">Back to top</a></div>
      </div>
    </footer>
  );
}

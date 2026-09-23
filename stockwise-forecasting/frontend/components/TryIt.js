'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import LineChart from './LineChart.js';
import { Arrow, Reveal } from './ui.js';
import { buildDaily, detectColumns, forecastSeries, parseCSV } from '../lib/clientForecast.js';
import { fmtNum, fmtPct } from '../lib/format.js';
import { site } from '../site.config.js';

const MAX_BYTES = 8 * 1024 * 1024;
const nulls = (n) => Array(n).fill(null);

export default function TryIt() {
  const fileRef = useRef(null);
  const [over, setOver] = useState(false);
  const [file, setFile] = useState(null);      // { name, parsed }
  const [cols, setCols] = useState(null);      // { date, value, group, groupValue }
  const [options, setOptions] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async (name, text) => {
    setError('');
    setResult(null);
    try {
      const parsed = parseCSV(text);
      const det = detectColumns(parsed);
      if (!det.date || !det.value) throw new Error('Could not find a date column and a numeric sales column. Check the header row.');
      const group = det.groups[0] || '';
      const groupValues = group ? [...new Set(parsed.rows.map((r) => r[group]))].slice(0, 100) : [];
      setFile({ name, parsed });
      setOptions({ fields: parsed.fields, groups: det.groups, groupValues: { [group]: groupValues } });
      setCols({ date: det.date, value: det.value, group, groupValue: groupValues[0] ?? '' });
    } catch (e) {
      setFile(null);
      setCols(null);
      setError(e.message);
    }
  };

  const onFile = async (f) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setError('That file is larger than 8 MB. Upload a smaller extract.');
    await load(f.name, await f.text());
  };

  const useSample = async () => {
    try {
      const res = await fetch('/sample-sales.csv');
      if (!res.ok) throw new Error('Sample file not found');
      await load('sample-sales.csv', await res.text());
    } catch (e) {
      setError(e.message);
    }
  };

  const changeGroup = (group) => {
    const values = group ? [...new Set(file.parsed.rows.map((r) => r[group]))].slice(0, 100) : [];
    setOptions((o) => ({ ...o, groupValues: { ...o.groupValues, [group]: values } }));
    setCols((c) => ({ ...c, group, groupValue: values[0] ?? '' }));
  };

  const run = () => {
    setBusy(true);
    setError('');
    // let the button state paint before the (fast) computation
    setTimeout(() => {
      try {
        const daily = buildDaily(file.parsed.rows, cols);
        setResult({ ...forecastSeries(daily), name: cols.group ? `${cols.group} = ${cols.groupValue}` : cols.value });
      } catch (e) {
        setResult(null);
        setError(e.message);
      }
      setBusy(false);
    }, 30);
  };

  const apiBase = site.apiUrl || 'https://YOUR-API.onrender.com';
  const snippet = `curl "${apiBase}/forecast?store=S1&item=I1&horizon=14&scenario=planned"`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const h = result?.holdout;
  const tail = 84;
  const chart = result && (() => {
    const hd = result.history.dates.slice(-tail);
    const hv = result.history.values.slice(-tail);
    const f = result.future;
    const pad = (a) => [...nulls(hd.length), ...a];
    return {
      xs: [...hd, ...f.dates],
      layers: [
        { key: 'a', label: 'Actual', color: '#111a3a', values: [...hv, ...nulls(f.dates.length)], width: 2 },
        { key: 'f', label: 'Forecast', color: '#3d63f0', values: pad(f.mean), width: 3 },
      ],
      bands: [{ key: 'b', label: '80% range', color: '#3d63f0', opacity: 0.16, lo: pad(f.lo), hi: pad(f.hi) }],
      marker: hd.length,
    };
  })();

  return (
    <section id="try" className="section tone-blue stack-flat">
      <div className="wrap try">
        <Reveal className="try-copy">
          <h2>Bring your own sales data</h2>
          <p>Drop in a CSV with a date column and a sales column. Quill fits a weekly-seasonal Holt-Winters model in your browser, holds out the last 28 days, and shows how it compares with repeating last week.</p>
          <p className="fineprint-light">This browser forecaster is deliberately simple. The full LightGBM pipeline runs in the Python backend.</p>
          <div className="code">
            <div className="code-top"><span>Or call the API</span><button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
            <pre><code>{snippet}</code></pre>
          </div>
        </Reveal>

        <Reveal className="try-form" delay={0.1}>
          <div
            className={`drop ${over ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
          >
            <b>{file ? file.name : 'Drop a CSV here'}</b>
            <span>{file ? `${file.parsed.rows.length.toLocaleString()} rows` : 'or choose a file, up to 8 MB'}</span>
            <div className="row">
              <button className="btn btn-field" onClick={() => fileRef.current?.click()}>Choose file</button>
              <button className="btn btn-field" onClick={useSample}>Use sample data</button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />
          </div>

          {cols ? (
            <motion.div className="mapping" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <label className="input"><span>Date column</span>
                <select value={cols.date} onChange={(e) => setCols({ ...cols, date: e.target.value })}>{options.fields.map((f) => <option key={f}>{f}</option>)}</select>
              </label>
              <label className="input"><span>Sales column</span>
                <select value={cols.value} onChange={(e) => setCols({ ...cols, value: e.target.value })}>{options.fields.map((f) => <option key={f}>{f}</option>)}</select>
              </label>
              <label className="input"><span>Split by (optional)</span>
                <select value={cols.group} onChange={(e) => changeGroup(e.target.value)}>
                  <option value="">All rows together</option>
                  {options.groups.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              {cols.group ? (
                <label className="input"><span>Value</span>
                  <select value={cols.groupValue} onChange={(e) => setCols({ ...cols, groupValue: e.target.value })}>
                    {(options.groupValues[cols.group] || []).map((v) => <option key={v}>{v}</option>)}
                  </select>
                </label>
              ) : null}
              <button className="btn btn-lav" onClick={run} disabled={busy}>{busy ? 'Forecasting' : 'Forecast my data'} <Arrow /></button>
            </motion.div>
          ) : null}
          {error ? <div className="alert" role="alert">{error}</div> : null}
        </Reveal>
      </div>

      <AnimatePresence>
        {result && chart ? (
          <motion.div className="wrap try-result" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <div className="card">
              <div className="card-top"><h3>Forecast for {result.name}</h3><span className="legend"><i className="dot dot-blue" /> Next 28 days <i className="dot dot-ink" /> Actual</span></div>
              <LineChart xs={chart.xs} layers={chart.layers} bands={chart.bands} marker={chart.marker} height={300} animateKey={`try-${result.name}-${result.history.dates.length}`} ariaLabel="Uploaded series with a 28 day forecast and an 80 percent range" />
              {h ? (
                <div className="kpis">
                  <div className="kpi"><span>Holt-Winters error (WAPE)</span><b>{fmtPct(h.wape_model, 1)}</b><em>last {h.days} days held out</em></div>
                  <div className="kpi"><span>Repeat-last-week error</span><b>{fmtPct(h.wape_naive, 1)}</b><em>{h.wape_model < h.wape_naive ? `${fmtNum((1 - h.wape_model / h.wape_naive) * 100, 0)}% higher than the model` : 'the model did not beat this baseline'}</em></div>
                  <div className="kpi"><span>80% range coverage</span><b>{fmtPct(h.coverage80, 0)}</b><em>target is 80%</em></div>
                </div>
              ) : <p className="note">Add at least {28 + 28} days of data to see a hold-out comparison.</p>}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

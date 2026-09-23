const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso, withYear = false) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

export function fmtNum(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return '-';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export const fmtPct = (v, digits = 0) => (v == null ? '-' : `${(v * 100).toFixed(digits)}%`);

export function wape(actual, forecast) {
  let err = 0;
  let tot = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] == null || forecast[i] == null) continue;
    err += Math.abs(actual[i] - forecast[i]);
    tot += Math.abs(actual[i]);
  }
  return tot ? err / tot : null;
}

export const sum = (a) => a.reduce((n, v) => n + (v ?? 0), 0);

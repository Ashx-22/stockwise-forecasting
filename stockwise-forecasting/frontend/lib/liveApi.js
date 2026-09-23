import { site } from '../site.config.js';

// Optional: when NEXT_PUBLIC_API_URL is set, ask the FastAPI service for a fresh forecast.
export const liveEnabled = Boolean(site.apiUrl);

export async function fetchLiveForecast({ store, item, scenario, signal }) {
  const url = `${site.apiUrl}/forecast?store=${encodeURIComponent(store)}&item=${encodeURIComponent(item)}&horizon=28&scenario=${scenario}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const j = await res.json();
  return { dates: j.dates, mean: j.forecast, q: j.quantiles };
}

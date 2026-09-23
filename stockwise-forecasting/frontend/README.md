# Stockwise frontend

A Next.js site that reads pre-computed forecasting results from `public/data/*.json` (written by the
Python pipeline in `../backend`) and presents them: a forecast explorer, a backtest scoreboard, a
cost-impact simulator, a monitoring dashboard, and a client-side forecaster for a visitor's own CSV.

## Run it

```bash
npm install
npm test          # unit tests for the client forecaster and the JS/Python cost-simulator parity
npm run dev        # http://localhost:3000
```

If `backend/frontend/public/data` hasn't been generated yet, run the backend pipeline first
(`cd ../backend && python -m stockwise.pipeline`) — the site has nothing to show without it.

## Structure

```
app/                 layout, page, global stylesheet
components/          Hero, HowItWorks, Explorer, Validation, Impact, Monitoring, Notes, TryIt, Footer, Nav
lib/data.js          fetches and caches the 6 JSON files public/data needs
lib/sim.js           client-side twin of backend/stockwise/business.py (the cost simulator)
lib/clientForecast.js  in-browser Holt-Winters forecaster for uploaded CSVs (the "Try it" section)
lib/liveApi.js        optional: calls a live FastAPI backend if NEXT_PUBLIC_API_URL is set
tests/                node:test unit tests (no browser needed)
```

## Connecting the live API (optional)

The site works fully from static JSON. To make the forecast explorer call a live FastAPI backend instead
(so it reflects the model exactly, not a snapshot), set:

```
NEXT_PUBLIC_API_URL=https://your-api.onrender.com
```

in `.env.local` (copy `.env.example`). When set, the explorer's "Next 28 days" view fetches from
`{NEXT_PUBLIC_API_URL}/forecast` and shows a "Live from API" badge; if the request fails for any reason it
falls back to the static JSON automatically.

## Why a client-side simulator exists (`lib/sim.js`)

The Impact section lets a visitor drag cost sliders and see results instantly, which means the cost math
has to run in the browser. Rather than trust two independent implementations to agree, `tests/sim.test.js`
checks `lib/sim.js`'s output against `backend/stockwise/business.py`'s actual exported output
(`public/data/business.json`) at the default cost settings, so a change to one that isn't mirrored in the
other fails CI.

## Why a client-side forecaster exists (`lib/clientForecast.js`)

The "Try it" section lets a visitor upload their own CSV with nothing sent to a server. It fits an additive
Holt-Winters model (grid-searching a small set of smoothing parameters) and, when there's enough history,
holds out the last 28 days to report an honest error number next to the seasonal-naive baseline. This is
deliberately simpler than the backend's LightGBM: it's meant to give an immediate, honest read on a
visitor's own data, not to replace the real pipeline.

## Design notes for anyone reviewing this

- **Every animated chart is hand-rolled SVG** (`components/LineChart.js`), not a charting library, so it
  can share exact positioning logic between the drawn line, the shaded uncertainty band, and the hover
  tooltip's crosshair.
- **The forecast explorer, backtest view and Impact simulator all read the same `series.json` and
  `business.json`.** There's a single source of truth (the Python pipeline's output) rather than the
  frontend recomputing forecasts.
- **Reduced motion is respected everywhere** via `useReducedMotion()` and a CSS
  `prefers-reduced-motion` block that collapses all animation durations to near-zero.

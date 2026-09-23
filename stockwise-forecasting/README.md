# Stockwise: demand forecasting you can defend

A full-stack demand forecasting project. A Python pipeline builds leak-free features, backtests three
models on rolling time windows, turns forecast error into a real cost comparison, and simulates a model
in production to catch accuracy loss and per-series drift. A Next.js site presents the results and lets
a visitor upload their own CSV and get a forecast entirely in the browser.

```
backend/     Python: data, features, models, backtesting, cost simulation, drift monitoring, FastAPI, tests
frontend/    Next.js site: forecast explorer, backtest scoreboard, cost impact tool, monitoring dashboard,
             a client-side forecaster for uploaded CSVs
```

## Why this exists

Most student forecasting projects stop at a notebook with an R-squared. This one is built the way a
production forecasting system is built:

- **No lookahead.** Every feature that touches sales is shifted by at least the forecast horizon.
  A unit test blanks all sales after a cutoff date and proves the features for the following window
  do not change.
- **Backtested against a baseline that can win.** A seasonal-naive repeat-last-week model and Holt-Winters
  are scored on the same rolling folds as the LightGBM model. The site reports the improvement honestly,
  and includes the case where a model does not beat the baseline.
- **Uncertainty, not just a point forecast.** Quantile models produce an 80% and 90% range, and the site
  reports the range's actual observed coverage next to its target.
- **Forecast error priced in money.** A newsvendor-style simulation compares ordering policies by their
  actual cost, not by an accuracy metric.
- **Monitored after "launch."** A frozen model is scored week by week on data it never saw, the way it
  would run in production, with weekly error and per-series drift.

## Quick start

You need Node.js 20.9+ and Python 3.10+.

```bash
# 1. Backend: generate the data behind the site (about one minute)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m stockwise.pipeline
pytest -q

# 2. Frontend: run the site
cd ../frontend
npm install
npm test
npm run dev                                              # http://localhost:3000
```

The pipeline writes JSON straight into `frontend/public/data`, so the site works with no live backend at
all. The FastAPI service (`backend/stockwise/api.py`) is optional; it's used for the "Live from API" badge
in the forecast explorer and lets you query forecasts programmatically. See `backend/README.md` and
`frontend/README.md` for details on each half, and `DEPLOY.md` for putting it online.

## What it can and cannot do

**Works on:** one sales table (date, store, item, sales, optional promo). Descriptive and predictive
questions about daily demand: totals, trends, rankings, cost trade-offs.

**Does not do:** multi-table joins, categorical demand drivers beyond promotions, or anything beyond a
28-day horizon without retraining.

**Tested on:** a seeded synthetic dataset (5 stores, 6 items, 3 years of daily data, with a demand shock
injected into 4 series so the monitoring page has something real to catch). Point `backend/stockwise/pipeline.py`
at your own CSV with `--csv path/to/file.csv` (columns: `date,store,item,sales[,promo]`, the Kaggle
"Store Item Demand Forecasting" schema) to run it on real data.

## Resume bullets (edit to match what you measure on your own data)

- Built an end-to-end demand forecasting system (LightGBM with quantile heads, Holt-Winters and a
  seasonal-naive baseline) with leak-free feature engineering verified by unit tests, evaluated over
  rolling-origin backtests.
- Converted forecast accuracy into a newsvendor cost comparison across four ordering policies, and built
  a production-monitoring simulation that scores a frozen model weekly and flags per-series drift.
- Shipped a FastAPI service and a Next.js site with a client-side CSV forecaster, deployed on Render and
  Vercel with CI running the Python and JavaScript test suites on every push.

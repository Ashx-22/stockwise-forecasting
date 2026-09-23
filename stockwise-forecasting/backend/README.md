# Stockwise backend

Python package `stockwise`: data generation, feature engineering, three forecasting models, rolling
backtests, a cost simulation, a production-monitoring simulation, an export pipeline and a FastAPI service.

## Install

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt                     # adds pytest + httpx for testing
```

## Run the pipeline

```bash
python -m stockwise.pipeline                            # synthetic data (default)
python -m stockwise.pipeline --csv path/to/sales.csv     # your own data: date,store,item,sales[,promo]
python -m stockwise.pipeline --quick                     # fewer trees, for a fast smoke test
python -m stockwise.pipeline --mlflow                    # also log the run with MLflow (pip install -r requirements-mlflow.txt)
```

This writes JSON to `../frontend/public/data` (the whole site reads from these files) and trained model
files plus a copy of the data to `artifacts/` (what the API serves from). Takes about a minute for the
default synthetic dataset on one core.

Console output at the end looks like:

```
WAPE by model (lower is better), 4 folds x 28 days:
   Seasonal naive         WAPE 0.339  MASE 1.163  bias +0.006
   Holt-Winters (ETS)     WAPE 0.243  MASE 0.842  bias -0.025
   LightGBM (global)      WAPE 0.235  MASE 0.821  bias -0.041
   monitoring status: attention, drifting series: ['S5-I1', 'S3-I5', 'S3-I2', 'S1-I4']
```

## Run the API

```bash
uvicorn stockwise.api:app --reload --port 8000
```

- `GET /health` — readiness and series count.
- `GET /series` — every (store, item) pair the model was trained on.
- `GET /forecast?store=S1&item=I1&horizon=28&scenario=planned` — daily forecast with an 80% and 90% range.
  `scenario` is `planned` (use the recorded future promo calendar), `none`, or `promo7` (promo for the
  first 7 forecast days).

The API reads from `artifacts/`, written by the pipeline above, so run the pipeline first.

## Test

```bash
pytest -q
```

12 tests. The most important ones:

- `test_features_have_no_lookahead` — blanks every sale after a cutoff date and asserts the features for
  the next `HORIZON` days are identical to the un-blanked run. This is the test that actually proves there
  is no leakage; a passing test suite without it would not be trustworthy.
- `test_features_do_change_when_lookahead_is_possible` — a control on the test above: proves the test can
  fail (one day past the horizon, blanking does change the features), so a pass isn't a tautology.
- `test_api_matches_exported_forecast` — the API and the exported `series.json` are produced by the same
  code path (`stockwise/forecast.py`), and this test proves they agree numerically.
- `test_psi_detects_shift_and_ignores_identical` — the drift metric is checked against a known shifted and
  unshifted distribution before it's trusted on real data.

## How the pipeline is organized

```
stockwise/
  config.py     all tunable constants in one place
  data.py       synthetic data generator (seeded) + real CSV loader
  features.py   leak-free feature engineering (every lag >= HORIZON days old)
  models.py     seasonal naive, Holt-Winters (statsmodels), LightGBM with quantile heads
  backtest.py   rolling-origin backtest across N_FOLDS expanding windows
  metrics.py    WAPE, bias, MASE, prediction-interval coverage
  business.py   newsvendor cost comparison across 4 ordering policies
  drift.py      freezes a model, scores it week by week, computes PSI and per-series bias
  forecast.py   the single function both the pipeline and the API call for future predictions
  pipeline.py   orchestrates all of the above and exports JSON + trained model artifacts
  api.py        FastAPI service that serves live forecasts from the trained artifacts
```

## Using your own data

`stockwise/data.py:load_csv()` expects columns `date, store, item, sales` (optional `promo`), matching the
Kaggle "Store Item Demand Forecasting" competition format. It keeps the 30 highest-volume series by
default (`--max-series` to change that) so the pipeline stays fast; every series gets its own model input
but the LightGBM model is trained globally across all of them.

## Design notes for anyone reviewing this

- **Poisson objective, not squared error.** Daily unit sales are count data with a long right tail; a
  Poisson-objective mean model fits that shape better than plain regression, and the quantile models around
  it still give a full uncertainty range.
- **MASE uses each series' own training-window seasonal-naive error as the scale**, not the test window's,
  so it can't be gamed by an easy test period.
- **The monitoring simulation is a simulation, not a real deployment history.** A model is frozen at a
  fixed date and scored on data after it, which is the same test a canary deployment would run, but it is
  replayed against historical data rather than live traffic.

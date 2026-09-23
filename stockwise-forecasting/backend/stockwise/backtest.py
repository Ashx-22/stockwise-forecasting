"""Rolling-origin backtest: N folds, each forecasting the next HORIZON days from an expanding window."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import HORIZON, N_FOLDS, QUANTILES
from .metrics import bias, coverage, mase, wape
from .models import QuantileGBM, ets_forecast, seasonal_naive

MODELS = {
    "seasonal_naive": "Seasonal naive",
    "ets": "Holt-Winters (ETS)",
    "lightgbm": "LightGBM (global)",
}


def fold_origins(end: pd.Timestamp, n_folds: int = N_FOLDS, horizon: int = HORIZON):
    return [end - pd.Timedelta(days=horizon * (n_folds - k)) for k in range(n_folds)]


def run_backtest(feats: pd.DataFrame, n_folds=N_FOLDS, horizon=HORIZON, gbm_params=None, log=print):
    """feats: build_features() output for the full history. Returns (predictions, last_fold_model)."""
    end = feats["date"].max()
    origins = fold_origins(end, n_folds, horizon)
    records, last_model = [], None
    for k, origin in enumerate(origins):
        train = feats[(feats["date"] <= origin) & feats["sales"].notna() & feats["lag_28"].notna()]
        model = QuantileGBM(params=gbm_params).fit(train, train["sales"].values)
        test = feats[(feats["date"] > origin) & (feats["date"] <= origin + pd.Timedelta(days=horizon))].copy()
        out = model.predict(test)
        test["lightgbm"] = out["mean"]
        for j, q in enumerate(QUANTILES):
            test[f"q{int(round(q * 100)):02d}"] = out["q"][:, j]
        naive, ets = {}, {}
        for s, g in feats[feats["date"] <= origin].groupby("series"):
            vals = g["sales"].values
            naive[s] = seasonal_naive(vals, horizon)
            ets[s] = ets_forecast(vals, horizon)
        test["step"] = test.groupby("series").cumcount()
        test["seasonal_naive"] = [naive[s][i] for s, i in zip(test["series"], test["step"])]
        test["ets"] = [ets[s][i] for s, i in zip(test["series"], test["step"])]
        test["fold"] = k
        test["origin"] = origin
        records.append(test)
        last_model = model
        log(f"  fold {k + 1}/{n_folds}: origin {origin.date()}, train rows {len(train):,}")
    return pd.concat(records, ignore_index=True), last_model


def summarize(preds: pd.DataFrame, feats: pd.DataFrame, n_folds=N_FOLDS) -> dict:
    """Pooled metrics per model plus WAPE per fold."""
    rows = []
    for name, label in MODELS.items():
        y, f = preds["sales"].values, preds[name].values
        # MASE: average across series and folds, scaled by each series' in-sample seasonal-naive MAE
        ms = []
        for (s, k), g in preds.groupby(["series", "fold"]):
            train = feats[(feats["series"] == s) & (feats["date"] <= g["origin"].iloc[0])]["sales"].values
            ms.append(mase(g["sales"].values, g[name].values, train))
        entry = {
            "model": name, "label": label,
            "wape": round(wape(y, f), 4), "mase": round(float(np.nanmean(ms)), 4), "bias": round(bias(y, f), 4),
            "coverage80": None,
            "wape_by_fold": [round(wape(g["sales"], g[name]), 4) for _, g in preds.groupby("fold")],
        }
        if name == "lightgbm":
            entry["coverage80"] = round(coverage(y, preds["q10"], preds["q90"]), 4)
        rows.append(entry)
    base = rows[0]["wape"]
    improvement = {r["model"]: round((base - r["wape"]) / base * 100, 1) for r in rows[1:]}
    best = min(rows, key=lambda r: r["wape"])["model"]
    return {"metrics": rows, "improvement_vs_baseline_pct": improvement, "best": best, "n_folds": n_folds, "horizon": HORIZON}

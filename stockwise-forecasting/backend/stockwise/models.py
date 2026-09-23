"""Forecasting models: seasonal naive baseline, ETS, and a global LightGBM with quantile heads."""
from __future__ import annotations

import json
import os
import warnings
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from .config import LGBM_PARAMS, QUANTILES
from .features import FEATURES


def seasonal_naive(values: np.ndarray, horizon: int, period: int = 7) -> np.ndarray:
    """Repeat the last full week."""
    values = np.asarray(values, float)
    last = values[-period:]
    reps = int(np.ceil(horizon / period))
    return np.tile(last, reps)[:horizon]


def ets_forecast(values: np.ndarray, horizon: int, period: int = 7, max_history: int = 365) -> np.ndarray:
    """Additive Holt-Winters (weekly season). Falls back to seasonal naive if the fit fails."""
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    values = np.asarray(values, float)[-max_history:]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fit = ExponentialSmoothing(
                values, trend=None, seasonal="add", seasonal_periods=period, initialization_method="estimated"
            ).fit(optimized=True)
            out = np.asarray(fit.forecast(horizon), float)
        if not np.all(np.isfinite(out)):
            raise ValueError("non-finite forecast")
        return np.clip(out, 0, None)
    except Exception:
        return seasonal_naive(values, horizon, period)


def _qname(q: float) -> str:
    return f"q{int(round(q * 100)):02d}"


class QuantileGBM:
    """One Poisson mean model plus one quantile model per level; quantiles are made monotone."""

    def __init__(self, params: dict | None = None, quantiles=QUANTILES, features=FEATURES):
        self.params = {**LGBM_PARAMS, **(params or {})}
        self.quantiles = list(quantiles)
        self.features = list(features)
        self.mean_model: lgb.LGBMRegressor | None = None
        self.q_models: dict[float, lgb.LGBMRegressor] = {}

    def fit(self, X: pd.DataFrame, y: np.ndarray) -> "QuantileGBM":
        X = X[self.features]
        cats = [c for c in ("store_code", "item_code") if c in self.features]
        self.mean_model = lgb.LGBMRegressor(objective="poisson", **self.params)
        self.mean_model.fit(X, y, categorical_feature=cats)
        for q in self.quantiles:
            m = lgb.LGBMRegressor(objective="quantile", alpha=q, **self.params)
            m.fit(X, y, categorical_feature=cats)
            self.q_models[q] = m
        return self

    def predict(self, X: pd.DataFrame) -> dict:
        X = X[self.features]
        mean = np.clip(self.mean_model.predict(X), 0, None)
        q = np.column_stack([np.clip(self.q_models[k].predict(X), 0, None) for k in self.quantiles])
        q = np.maximum.accumulate(q, axis=1)          # no crossing quantiles
        return {"mean": mean, "q": q, "levels": self.quantiles}

    def feature_importance(self) -> dict:
        imp = self.mean_model.booster_.feature_importance(importance_type="gain")
        total = float(imp.sum()) or 1.0
        return {f: float(v) / total for f, v in zip(self.features, imp)}

    def save(self, directory: str | os.PathLike) -> None:
        d = Path(directory)
        d.mkdir(parents=True, exist_ok=True)
        self.mean_model.booster_.save_model(str(d / "mean.txt"))
        for q, m in self.q_models.items():
            m.booster_.save_model(str(d / f"{_qname(q)}.txt"))
        (d / "meta.json").write_text(json.dumps({"features": self.features, "quantiles": self.quantiles}))


class LoadedQuantileGBM:
    """Inference-only wrapper around saved boosters (used by the API; no training code needed)."""

    def __init__(self, directory: str | os.PathLike):
        d = Path(directory)
        meta = json.loads((d / "meta.json").read_text())
        self.features, self.quantiles = meta["features"], meta["quantiles"]
        self.mean_booster = lgb.Booster(model_file=str(d / "mean.txt"))
        self.q_boosters = {q: lgb.Booster(model_file=str(d / f"{_qname(q)}.txt")) for q in self.quantiles}

    def predict(self, X: pd.DataFrame) -> dict:
        X = X[self.features]
        mean = np.clip(self.mean_booster.predict(X), 0, None)
        q = np.column_stack([np.clip(self.q_boosters[k].predict(X), 0, None) for k in self.quantiles])
        return {"mean": mean, "q": np.maximum.accumulate(q, axis=1), "levels": self.quantiles}

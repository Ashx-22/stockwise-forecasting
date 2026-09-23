"""Leak-free feature engineering.

Every feature that touches historical sales is shifted by at least HORIZON days. A forecast for day d
made at origin o (d <= o + HORIZON) therefore only uses sales up to o. tests/test_features.py proves this
by blanking all sales after the origin and checking that the test-window features do not change.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import HORIZON
from .data import add_series_key, holiday_mask

LAGS = [28, 35, 42, 49, 56, 63, 70, 77, 364]
ROLL_WINDOWS = [7, 28, 56]
SAME_DOW_LAGS = [28, 35, 42, 49, 56, 63, 70, 77]      # multiples of 7: same weekday as the target day

FEATURES = (
    ["store_code", "item_code", "dow", "dom", "month", "week", "doy_sin", "doy_cos", "is_weekend", "holiday", "promo", "promo_prev1"]
    + [f"lag_{l}" for l in LAGS]
    + [f"rmean_{w}" for w in ROLL_WINDOWS]
    + ["rstd_28", "dow_mean_8w", "trend_ratio"]
)


def make_maps(df: pd.DataFrame):
    return (
        {s: i for i, s in enumerate(sorted(df["store"].unique()))},
        {s: i for i, s in enumerate(sorted(df["item"].unique()))},
    )


def build_features(df: pd.DataFrame, store_map: dict, item_map: dict, horizon: int = HORIZON) -> pd.DataFrame:
    """df: date, store, item, sales (NaN allowed for future days), promo. One row per series per day."""
    df = add_series_key(df).sort_values(["series", "date"]).reset_index(drop=True)
    d = df["date"]
    df["store_code"] = df["store"].map(store_map).astype(int)
    df["item_code"] = df["item"].map(item_map).astype(int)
    df["dow"] = d.dt.dayofweek
    df["dom"] = d.dt.day
    df["month"] = d.dt.month
    df["week"] = d.dt.isocalendar().week.astype(int)
    doy = d.dt.dayofyear.values
    df["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    df["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["holiday"] = holiday_mask(pd.DatetimeIndex(d)).astype(int)
    df["promo"] = df["promo"].astype(int)
    df["promo_prev1"] = df.groupby("series")["promo"].shift(1).fillna(0).astype(int)

    g = df.groupby("series")["sales"]
    for lag in LAGS:
        df[f"lag_{lag}"] = g.shift(lag)
    shifted = g.shift(horizon)
    by_series = shifted.groupby(df["series"])
    for w in ROLL_WINDOWS:
        df[f"rmean_{w}"] = by_series.transform(lambda s, w=w: s.rolling(w, min_periods=max(1, w // 2)).mean())
    df["rstd_28"] = by_series.transform(lambda s: s.rolling(28, min_periods=14).std())
    df["dow_mean_8w"] = df[[f"lag_{l}" for l in SAME_DOW_LAGS]].mean(axis=1)
    df["trend_ratio"] = df["rmean_7"] / (df["rmean_56"] + 1e-6)
    return df

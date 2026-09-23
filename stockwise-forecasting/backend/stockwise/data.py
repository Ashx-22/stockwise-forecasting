"""Data loading and a seeded synthetic retail-demand generator.

Real data plugs in through load_csv() (the Kaggle "Store Item Demand Forecasting" schema:
date, store, item, sales). The synthetic generator exists so the project runs anywhere, offline, and
its answers are reproducible. It also injects a small, documented demand shock in the last weeks
so the monitoring module has something real to detect.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import HORIZON

HOLIDAYS_MD = [(1, 1), (2, 14), (5, 1), (8, 15), (10, 31), (12, 24), (12, 25), (12, 31)]

STORE_LABELS = {"S1": "Chennai", "S2": "Bengaluru", "S3": "Hyderabad", "S4": "Coimbatore", "S5": "Salem"}
ITEM_LABELS = {
    "I1": "Bottled water", "I2": "Instant noodles", "I3": "Filter coffee",
    "I4": "Notebooks", "I5": "Detergent", "I6": "Snack packs",
}
_ITEM_BASE = [40, 55, 25, 18, 30, 45]
_STORE_SCALE = [1.3, 1.1, 0.95, 0.8, 0.65]

# (store, item) -> multiplicative demand shock applied from drift_start onwards
DRIFT_SERIES = {("S3", "I2"): 1.45, ("S3", "I5"): 0.60, ("S5", "I1"): 1.35, ("S1", "I4"): 0.65}


def holiday_mask(dates: pd.DatetimeIndex) -> np.ndarray:
    md = set(HOLIDAYS_MD)
    return np.array([(d.month, d.day) in md for d in dates])


def add_series_key(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["series"] = df["store"].astype(str) + "-" + df["item"].astype(str)
    return df


def generate_synthetic(
    seed: int = 42,
    n_stores: int = 5,
    n_items: int = 6,
    start: str = "2023-01-01",
    end: str = "2025-12-31",
    drift_start: str = "2025-11-17",
    drift: bool = True,
    horizon: int = HORIZON,
):
    """Returns (history, future_promo, meta). history: date, store, item, sales, promo."""
    rng = np.random.default_rng(seed)
    end_ts = pd.Timestamp(end)
    all_dates = pd.date_range(start, end_ts + pd.Timedelta(days=horizon), freq="D")
    n_hist = (end_ts - pd.Timestamp(start)).days + 1
    T = len(all_dates)
    t = np.arange(T)
    dow = all_dates.dayofweek.values
    doy = all_dates.dayofyear.values
    hol = holiday_mask(all_dates).astype(float)
    after_drift = np.asarray(all_dates >= pd.Timestamp(drift_start))

    stores = [f"S{i + 1}" for i in range(n_stores)]
    items = [f"I{j + 1}" for j in range(n_items)]
    item_base = [(_ITEM_BASE[j] if j < len(_ITEM_BASE) else float(rng.uniform(15, 60))) for j in range(n_items)]
    store_scale = [(_STORE_SCALE[i] if i < len(_STORE_SCALE) else float(rng.uniform(0.6, 1.4))) for i in range(n_stores)]

    hist_parts, fut_parts = [], []
    for si, s in enumerate(stores):
        for ii, it in enumerate(items):
            base = item_base[ii] * store_scale[si]
            weekend = rng.uniform(0.0, 0.35)
            dow_profile = 1 + rng.normal(0, 0.10, 7) + weekend * (np.arange(7) >= 5)
            amp, phase = rng.uniform(0.05, 0.30), rng.uniform(0, 2 * np.pi)
            yearly = 1 + amp * np.sin(2 * np.pi * doy / 365.25 + phase)
            trend = 1 + rng.uniform(-0.08, 0.30) * t / T
            promo = np.zeros(T, dtype=int)
            pos = int(rng.integers(5, 25))
            while pos < T:
                length = int(rng.integers(3, 8))
                promo[pos:pos + length] = 1
                pos += length + int(rng.integers(21, 56))
            promo_uplift = rng.uniform(0.25, 0.70)
            hol_uplift = rng.uniform(0.10, 0.50)
            mean = base * dow_profile[dow] * yearly * trend * (1 + promo_uplift * promo) * (1 + hol_uplift * hol)
            if drift and (s, it) in DRIFT_SERIES:
                mean = mean * np.where(after_drift, DRIFT_SERIES[(s, it)], 1.0)
            sales = rng.poisson(mean * rng.gamma(20, 1 / 20, size=T)).astype(float)
            frame = pd.DataFrame({"date": all_dates, "store": s, "item": it, "sales": sales, "promo": promo})
            hist_parts.append(frame.iloc[:n_hist])
            fut_parts.append(frame.iloc[n_hist:][["date", "store", "item", "promo"]])

    history = pd.concat(hist_parts, ignore_index=True)
    future_promo = pd.concat(fut_parts, ignore_index=True)
    meta = {
        "name": "Synthetic retail demand (seeded)",
        "synthetic": True,
        "store_labels": {s: STORE_LABELS.get(s, s) for s in stores},
        "item_labels": {i: ITEM_LABELS.get(i, i) for i in items},
        "drift_injected": (
            [{"store": s, "item": i, "factor": f, "from": drift_start} for (s, i), f in DRIFT_SERIES.items()
             if s in stores and i in items] if drift else []
        ),
    }
    return history, future_promo, meta


def complete_grid(df: pd.DataFrame) -> pd.DataFrame:
    """Guarantee one row per series per day (missing days become 0 sales, promo 0)."""
    out = []
    full = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    for (s, i), g in df.groupby(["store", "item"], sort=True):
        g = g.set_index("date").reindex(full)
        g["store"], g["item"] = s, i
        g["sales"] = g["sales"].fillna(0.0)
        g["promo"] = g["promo"].fillna(0).astype(int)
        out.append(g.rename_axis("date").reset_index())
    return pd.concat(out, ignore_index=True)[["date", "store", "item", "sales", "promo"]]


def load_csv(path: str, max_series: int = 30, horizon: int = HORIZON):
    """Load a CSV with columns date, store, item, sales (optional: promo).

    Keeps the max_series highest-volume series so the pipeline stays fast.
    """
    df = pd.read_csv(path, parse_dates=["date"])
    missing = {"date", "store", "item", "sales"} - set(df.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {sorted(missing)}")
    if "promo" not in df.columns:
        df["promo"] = 0
    df["store"], df["item"] = df["store"].astype(str), df["item"].astype(str)
    top = (df.groupby(["store", "item"])["sales"].sum().sort_values(ascending=False).head(max_series).index)
    df = df.set_index(["store", "item"]).loc[top].reset_index()
    history = complete_grid(df[["date", "store", "item", "sales", "promo"]])
    end = history["date"].max()
    fut_dates = pd.date_range(end + pd.Timedelta(days=1), periods=horizon, freq="D")
    future_promo = pd.DataFrame(
        [(d, s, i, 0) for (s, i) in history[["store", "item"]].drop_duplicates().itertuples(index=False) for d in fut_dates],
        columns=["date", "store", "item", "promo"],
    )
    stores = sorted(history["store"].unique())
    items = sorted(history["item"].unique())
    meta = {
        "name": f"Uploaded dataset ({path})", "synthetic": False,
        "store_labels": {s: s for s in stores}, "item_labels": {i: i for i in items}, "drift_injected": [],
    }
    return history, future_promo, meta

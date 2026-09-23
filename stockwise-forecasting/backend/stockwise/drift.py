"""Production monitoring simulation.

A "champion" model is frozen at freeze_date and then scored week by week on data it never saw, exactly
as it would be in production (features come from live history, which is always at least 28 days old).

Three signals are tracked:
  * weekly WAPE of the champion versus a lag-28 baseline (aggregate accuracy),
  * weekly PSI of the actual/forecast ratio versus the first healthy weeks (aggregate distribution shift),
  * per-series bias over the last 28 days (catches a few series drifting while the aggregate looks fine).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import DRIFT_BIAS_THRESHOLD, PERF_RATIO_THRESHOLD, PSI_ALERT, PSI_WATCH
from .metrics import wape
from .models import QuantileGBM


def psi(reference: np.ndarray, current: np.ndarray, bins: int = 10) -> float:
    """Population stability index of `current` against `reference` (bins are reference quantiles)."""
    reference, current = np.asarray(reference, float), np.asarray(current, float)
    edges = np.unique(np.quantile(reference, np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf
    r = np.histogram(reference, edges)[0] / max(len(reference), 1)
    c = np.histogram(current, edges)[0] / max(len(current), 1)
    r, c = np.clip(r, 1e-4, None), np.clip(c, 1e-4, None)
    return float(np.sum((c - r) * np.log(c / r)))


def run_monitoring(feats: pd.DataFrame, weeks: int, gbm_params=None, log=print) -> dict:
    end = feats["date"].max()
    freeze = end - pd.Timedelta(days=7 * weeks)
    train = feats[(feats["date"] <= freeze) & feats["sales"].notna() & feats["lag_28"].notna()]
    champion = QuantileGBM(params=gbm_params, quantiles=[0.5]).fit(train, train["sales"].values)
    live = feats[(feats["date"] > freeze) & (feats["date"] <= end)].copy()
    live["champion"] = champion.predict(live)["mean"]
    live["week"] = ((live["date"] - freeze).dt.days - 1) // 7
    live["ratio"] = (live["sales"] + 1) / (live["champion"] + 1)
    log(f"  champion frozen at {freeze.date()}, scoring {weeks} weeks")

    ref_weeks = max(3, weeks // 3)
    ref_ratio = live.loc[live["week"] < ref_weeks, "ratio"].values

    week_rows = []
    for w, g in live.groupby("week"):
        week_rows.append({
            "week_start": str((freeze + pd.Timedelta(days=int(w) * 7 + 1)).date()),
            "wape_champion": round(wape(g["sales"], g["champion"]), 4),
            "wape_baseline": round(wape(g["sales"], g["lag_28"]), 4),
            "bias_champion": round(float((g["champion"].sum() - g["sales"].sum()) / max(g["sales"].sum(), 1e-9)), 4),
            "psi_ratio": round(psi(ref_ratio, g["ratio"].values, 10), 4) if w >= ref_weeks else None,
        })
    wk = pd.DataFrame(week_rows)
    reference_wape = float(wk["wape_champion"].iloc[:ref_weeks].median())

    recent = live[live["date"] > end - pd.Timedelta(days=28)]
    by_series = []
    for s, g in recent.groupby("series"):
        by_series.append({
            "series": s,
            "bias_pct": round((float(g["sales"].sum()) / max(float(g["champion"].sum()), 1e-9) - 1) * 100, 1),
            "wape_champion": round(wape(g["sales"], g["champion"]), 4),
        })
    by_series.sort(key=lambda r: abs(r["bias_pct"]), reverse=True)
    drifting = [r for r in by_series if abs(r["bias_pct"]) / 100 > DRIFT_BIAS_THRESHOLD]

    perf_threshold = reference_wape * PERF_RATIO_THRESHOLD
    alerts = [
        {"type": "performance", "week_start": r["week_start"], "value": r["wape_champion"], "threshold": round(perf_threshold, 4)}
        for r in week_rows if r["wape_champion"] > perf_threshold
    ]
    last_two_bad = len(week_rows) >= 2 and all(r["wape_champion"] > perf_threshold for r in week_rows[-2:])
    return {
        "freeze_date": str(freeze.date()),
        "reference_weeks": int(ref_weeks),
        "weeks": week_rows,
        "reference_wape": round(reference_wape, 4),
        "thresholds": {"bias": DRIFT_BIAS_THRESHOLD, "wape_ratio": PERF_RATIO_THRESHOLD, "psi_watch": PSI_WATCH,
                       "psi_alert": PSI_ALERT, "wape_alert_level": round(perf_threshold, 4)},
        "alerts": alerts,
        "drifting_series": drifting,
        "by_series": by_series[:8],
        "n_series": len(by_series),
        "status": "attention" if (drifting or last_two_bad) else "healthy",
    }

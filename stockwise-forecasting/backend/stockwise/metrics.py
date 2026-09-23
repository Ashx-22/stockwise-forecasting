from __future__ import annotations

import numpy as np


def wape(y, f) -> float:
    y, f = np.asarray(y, float), np.asarray(f, float)
    return float(np.abs(y - f).sum() / max(np.abs(y).sum(), 1e-9))


def bias(y, f) -> float:
    """Positive means over-forecasting."""
    y, f = np.asarray(y, float), np.asarray(f, float)
    return float((f.sum() - y.sum()) / max(np.abs(y).sum(), 1e-9))


def mase(y, f, train, period: int = 7) -> float:
    """Mean absolute scaled error: MAE divided by the in-sample seasonal-naive MAE."""
    train = np.asarray(train, float)
    scale = np.abs(train[period:] - train[:-period]).mean() if len(train) > period else np.nan
    if not np.isfinite(scale) or scale == 0:
        return float("nan")
    return float(np.abs(np.asarray(y, float) - np.asarray(f, float)).mean() / scale)


def coverage(y, lo, hi) -> float:
    y, lo, hi = np.asarray(y, float), np.asarray(lo, float), np.asarray(hi, float)
    return float(((y >= lo) & (y <= hi)).mean())

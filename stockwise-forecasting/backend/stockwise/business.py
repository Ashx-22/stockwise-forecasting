"""Turning forecast error into money: a newsvendor-style cost comparison of ordering policies."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import DEFAULT_HOLDING_COST, DEFAULT_STOCKOUT_COST, QUANTILES


def interp_quantile(q_matrix: np.ndarray, levels, tau: float) -> np.ndarray:
    """Linear interpolation across quantile levels for every row; tau is clamped to the available range."""
    levels = np.asarray(levels, float)
    tau = float(np.clip(tau, levels[0], levels[-1]))
    hi = int(np.searchsorted(levels, tau))
    if hi == 0 or levels[hi] == tau:
        return q_matrix[:, hi]
    lo = hi - 1
    w = (tau - levels[lo]) / (levels[hi] - levels[lo])
    return q_matrix[:, lo] * (1 - w) + q_matrix[:, hi] * w


def policy_cost(order: np.ndarray, demand: np.ndarray, holding: float, stockout: float) -> dict:
    over = np.clip(order - demand, 0, None)
    under = np.clip(demand - order, 0, None)
    return {
        "cost": float(holding * over.sum() + stockout * under.sum()),
        "fill_rate": float(np.minimum(order, demand).sum() / max(demand.sum(), 1e-9)),
        "excess_units": float(over.sum()),
        "short_units": float(under.sum()),
    }


def evaluate_policies(fold_preds: pd.DataFrame, holding=DEFAULT_HOLDING_COST, stockout=DEFAULT_STOCKOUT_COST) -> dict:
    tau = stockout / (stockout + holding)
    demand = fold_preds["sales"].values
    qcols = [f"q{int(round(q * 100)):02d}" for q in QUANTILES]
    qmat = fold_preds[qcols].values
    orders = {
        "seasonal_naive": fold_preds["seasonal_naive"].values,
        "ets": fold_preds["ets"].values,
        "lightgbm_mean": fold_preds["lightgbm"].values,
        "lightgbm_quantile": interp_quantile(qmat, QUANTILES, tau),
    }
    return {
        "holding": holding, "stockout": stockout, "critical_ratio": tau,
        "policies": {k: policy_cost(v, demand, holding, stockout) for k, v in orders.items()},
    }

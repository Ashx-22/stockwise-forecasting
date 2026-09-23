"""Future forecasts. The pipeline and the API both call predict_future(), so they can never disagree."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import HORIZON
from .features import build_features


def scenario_promo(future_promo: pd.DataFrame, scenario: str) -> pd.DataFrame:
    """planned: the promo calendar as given. none: no promos. promo7: promo on for the first 7 forecast days."""
    fp = future_promo.copy()
    if scenario == "none":
        fp["promo"] = 0
    elif scenario == "promo7":
        first7 = sorted(fp["date"].unique())[:7]
        fp.loc[fp["date"].isin(first7), "promo"] = 1
    elif scenario != "planned":
        raise ValueError(f"unknown promo scenario: {scenario}")
    return fp


def predict_future(history, future_promo, model, store_map, item_map, scenario="planned", horizon=HORIZON):
    """Returns a frame of future rows with the model outputs: mean, q05..q95 (as a 2-D array in .attrs)."""
    fut = scenario_promo(future_promo, scenario)
    fut = fut.assign(sales=np.nan)[["date", "store", "item", "sales", "promo"]]
    ext = pd.concat([history[["date", "store", "item", "sales", "promo"]], fut], ignore_index=True)
    feats = build_features(ext, store_map, item_map, horizon)
    rows = feats[feats["date"] > history["date"].max()].reset_index(drop=True)
    out = model.predict(rows)
    rows["pred_mean"] = out["mean"]
    return rows, out

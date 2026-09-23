"""FastAPI service. Run:  uvicorn stockwise.api:app --port 8000"""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import HORIZON
from .forecast import predict_future
from .models import LoadedQuantileGBM, seasonal_naive

ARTIFACTS = Path(os.getenv("STOCKWISE_ARTIFACTS", Path(__file__).resolve().parents[1] / "artifacts"))
state: dict = {"ready": False}


def load_state(path: Path = ARTIFACTS) -> None:
    try:
        maps = json.loads((path / "maps.json").read_text())
        state.update(
            history=pd.read_csv(path / "history.csv.gz", parse_dates=["date"]),
            future_promo=pd.read_csv(path / "future_promo.csv", parse_dates=["date"]),
            model=LoadedQuantileGBM(path / "models"),
            store_map=maps["store_map"], item_map=maps["item_map"], ready=True,
        )
    except FileNotFoundError:
        state["ready"] = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_state()
    yield


app = FastAPI(title="Stockwise API", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")],
    allow_methods=["GET"], allow_headers=["*"],
)


def _need_ready():
    if not state.get("ready"):
        raise HTTPException(503, "Model artifacts not found. Run: python -m stockwise.pipeline")


@app.get("/health")
def health():
    return {"status": "ok" if state.get("ready") else "no_artifacts", "version": __version__,
            "series": int(state["history"].groupby(["store", "item"]).ngroups) if state.get("ready") else 0}


@app.get("/series")
def list_series():
    _need_ready()
    h = state["history"]
    return {"series": [{"store": s, "item": i} for s, i in h[["store", "item"]].drop_duplicates().itertuples(index=False)],
            "last_date": str(h["date"].max().date())}


@app.get("/forecast")
def forecast(
    store: str,
    item: str,
    horizon: int = Query(HORIZON, ge=1, le=HORIZON),
    scenario: str = Query("planned", pattern="^(planned|none|promo7)$"),
):
    """Daily demand forecast with an 80 percent and a 90 percent prediction interval."""
    _need_ready()
    h = state["history"]
    hist = h[(h["store"] == store) & (h["item"] == item)]
    if hist.empty:
        raise HTTPException(404, f"Unknown series {store}/{item}")
    fut = state["future_promo"]
    fut = fut[(fut["store"] == store) & (fut["item"] == item)]
    rows, out = predict_future(hist, fut, state["model"], state["store_map"], state["item_map"], scenario)
    lv = out["levels"]
    return {
        "store": store, "item": item, "scenario": scenario, "horizon": horizon,
        "dates": [str(d.date()) for d in rows["date"]][:horizon],
        "forecast": [round(float(x), 2) for x in out["mean"][:horizon]],
        "quantiles": {str(q): [round(float(x), 2) for x in out["q"][:horizon, j]] for j, q in enumerate(lv)},
        "baseline_seasonal_naive": [round(float(x), 2) for x in seasonal_naive(hist.sort_values("date")["sales"].values, horizon)],
    }

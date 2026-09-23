"""End-to-end pipeline: data -> features -> backtest -> final model -> monitoring -> JSON for the website.

    python -m stockwise.pipeline                       # synthetic data, writes ../frontend/public/data
    python -m stockwise.pipeline --csv train.csv       # real data (date,store,item,sales[,promo])
    python -m stockwise.pipeline --mlflow              # also log the run to a local MLflow store
"""
from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

import lightgbm
import numpy as np
import pandas as pd

from . import __version__
from .backtest import MODELS, fold_origins, run_backtest, summarize
from .business import evaluate_policies
from .config import (DEFAULT_HOLDING_COST, DEFAULT_STOCKOUT_COST, HORIZON, MONITOR_WEEKS, N_FOLDS, QUANTILES)
from .data import add_series_key, generate_synthetic, load_csv
from .drift import run_monitoring
from .features import FEATURES, build_features, make_maps
from .forecast import predict_future
from .models import QuantileGBM, ets_forecast, seasonal_naive

HISTORY_DAYS_SHOWN = 120


def _r(a, nd=1):
    return [round(float(x), nd) for x in a]


def _qdict(q_matrix: np.ndarray, idx: np.ndarray) -> dict:
    return {str(q): _r(q_matrix[idx, j]) for j, q in enumerate(QUANTILES)}


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="Stockwise training + export pipeline")
    ap.add_argument("--csv", help="CSV with columns date,store,item,sales[,promo]")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "frontend" / "public" / "data"))
    ap.add_argument("--artifacts", default=str(Path(__file__).resolve().parents[1] / "artifacts"))
    ap.add_argument("--max-series", type=int, default=30)
    ap.add_argument("--quick", action="store_true", help="fewer trees; for tests")
    ap.add_argument("--mlflow", action="store_true", help="log to a local MLflow file store")
    ap.add_argument("--folds", type=int, default=N_FOLDS)
    args = ap.parse_args(argv)
    t0 = time.time()
    out_dir, art_dir = Path(args.out), Path(args.artifacts)
    gbm = {"n_estimators": 60} if args.quick else None
    weeks = 8 if args.quick else MONITOR_WEEKS

    print("1/6 loading data")
    if args.csv:
        history, future_promo, meta = load_csv(args.csv, max_series=args.max_series)
    else:
        history, future_promo, meta = generate_synthetic()
    store_map, item_map = make_maps(history)
    feats = build_features(history, store_map, item_map)
    end = history["date"].max()
    n_series = history.groupby(["store", "item"]).ngroups
    print(f"   {len(history):,} rows, {n_series} series, {history['date'].min().date()} to {end.date()}")

    print("2/6 rolling backtest")
    preds, _ = run_backtest(feats, n_folds=args.folds, gbm_params=gbm)
    lb = summarize(preds, feats, n_folds=args.folds)

    print("3/6 final model + future forecasts")
    train = feats[feats["sales"].notna() & feats["lag_28"].notna()]
    final = QuantileGBM(params=gbm).fit(train, train["sales"].values)
    final.save(art_dir / "models")
    fut_planned, out_planned = predict_future(history, future_promo, final, store_map, item_map, "planned")
    fut_promo, out_promo = predict_future(history, future_promo, final, store_map, item_map, "promo7")
    fut_planned = add_series_key(fut_planned)
    fut_promo = add_series_key(fut_promo)

    print("4/6 monitoring simulation")
    monitoring = run_monitoring(feats, weeks=weeks, gbm_params=gbm)

    print("5/6 business layer")
    last_fold = preds[preds["fold"] == args.folds - 1]
    business = evaluate_policies(last_fold)

    print("6/6 exporting")
    hist_keyed = add_series_key(history)
    last_origin = last_fold["origin"].iloc[0]
    series_json = {}
    for s, g in hist_keyed.groupby("series"):
        g = g.sort_values("date")
        store, item = g["store"].iloc[0], g["item"].iloc[0]
        vals = g["sales"].values
        bt = last_fold[last_fold["series"] == s].sort_values("date")
        fp = fut_planned[fut_planned["series"] == s].sort_values("date")
        fp_idx = fut_planned.index[fut_planned["series"] == s]
        fp7_idx = fut_promo.index[fut_promo["series"] == s]
        fp7 = fut_promo[fut_promo["series"] == s].sort_values("date")
        series_json[s] = {
            "store": store, "item": item,
            "store_label": meta["store_labels"].get(store, store), "item_label": meta["item_labels"].get(item, item),
            "history": {"dates": [str(d.date()) for d in g["date"].iloc[-HISTORY_DAYS_SHOWN:]], "values": _r(vals[-HISTORY_DAYS_SHOWN:], 0)},
            "backtest": {
                "dates": [str(d.date()) for d in bt["date"]],
                "actual": _r(bt["sales"], 0),
                "seasonal_naive": _r(bt["seasonal_naive"]), "ets": _r(bt["ets"]), "lightgbm": _r(bt["lightgbm"]),
                "lightgbm_q": {str(q): _r(bt[f"q{int(round(q * 100)):02d}"]) for q in QUANTILES},
            },
            "future": {
                "dates": [str(d.date()) for d in fp["date"]],
                "seasonal_naive": _r(seasonal_naive(vals, HORIZON)),
                "ets": _r(ets_forecast(vals, HORIZON)),
                "lightgbm": _r(fp["pred_mean"]),
                "lightgbm_q": _qdict(out_planned["q"], fp_idx.values),
                "promo7": {"lightgbm": _r(fp7["pred_mean"]), "lightgbm_q": _qdict(out_promo["q"], fp7_idx.values)},
            },
        }

    imp = sorted(final.feature_importance().items(), key=lambda kv: kv[1], reverse=True)[:10]
    meta_json = {
        "project": "Stockwise", "version": __version__,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": {
            "name": meta["name"], "synthetic": meta["synthetic"], "rows": int(len(history)), "n_series": int(n_series),
            "start": str(history["date"].min().date()), "end": str(end.date()),
            "stores": [{"id": k, "label": v} for k, v in meta["store_labels"].items()],
            "items": [{"id": k, "label": v} for k, v in meta["item_labels"].items()],
            "drift_injected": meta["drift_injected"],
        },
        "horizon": HORIZON, "n_folds": args.folds,
        "folds": [{"origin": str(o.date()), "test_start": str((o + pd.Timedelta(days=1)).date()),
                   "test_end": str((o + pd.Timedelta(days=HORIZON)).date())} for o in fold_origins(end, args.folds)],
        "cost_defaults": {"holding": DEFAULT_HOLDING_COST, "stockout": DEFAULT_STOCKOUT_COST},
        "quantiles": QUANTILES,
        "models": [{"id": k, "label": v} for k, v in MODELS.items()],
        "n_features": len(FEATURES),
        "versions": {"python": platform.python_version(), "lightgbm": lightgbm.__version__, "pandas": pd.__version__},
    }
    _write(out_dir / "meta.json", meta_json)
    _write(out_dir / "leaderboard.json", lb)
    _write(out_dir / "series.json", series_json)
    _write(out_dir / "business.json", business)
    _write(out_dir / "drift.json", monitoring)
    _write(out_dir / "features.json", [{"feature": k, "gain_share": round(v, 4)} for k, v in imp])

    # artifacts for the API
    hist_keyed[["date", "store", "item", "sales", "promo"]].to_csv(art_dir / "history.csv.gz", index=False)
    future_promo.to_csv(art_dir / "future_promo.csv", index=False)
    _write(art_dir / "maps.json", {"store_map": store_map, "item_map": item_map, "horizon": HORIZON})

    if args.mlflow:
        try:
            import mlflow

            mlflow.set_tracking_uri(f"sqlite:///{(art_dir / 'mlflow.db').resolve()}")
            mlflow.set_experiment("stockwise")
            with mlflow.start_run(run_name=f"pipeline-{datetime.now():%Y%m%d-%H%M}"):
                mlflow.log_params({"horizon": HORIZON, "folds": args.folds, "n_series": n_series, "features": len(FEATURES)})
                for m in lb["metrics"]:
                    mlflow.log_metrics({f"{m['model']}_wape": m["wape"], f"{m['model']}_mase": m["mase"], f"{m['model']}_bias": m["bias"]})
                mlflow.log_artifacts(str(out_dir), artifact_path="exports")
            print(f"   logged run to MLflow (view with: mlflow ui --backend-store-uri sqlite:///{art_dir / 'mlflow.db'})")
        except Exception as exc:  # MLflow is optional: never let it break the pipeline
            print(f"   MLflow logging skipped ({type(exc).__name__}). Install with: pip install -r requirements-mlflow.txt")

    print(f"\nWAPE by model (lower is better), {args.folds} folds x {HORIZON} days:")
    for m in lb["metrics"]:
        print(f"   {m['label']:<22} WAPE {m['wape']:.3f}  MASE {m['mase']:.3f}  bias {m['bias']:+.3f}")
    print(f"   monitoring status: {monitoring['status']}, drifting series: {[s['series'] for s in monitoring['drifting_series']]}")
    print(f"done in {time.time() - t0:.0f}s -> {out_dir}")


if __name__ == "__main__":
    main()

import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from stockwise import api, pipeline
from stockwise.data import generate_synthetic


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    root = tmp_path_factory.mktemp("sw")
    hist, _, _ = generate_synthetic(n_stores=2, n_items=2, start="2023-03-01", end="2025-02-28", drift=False)
    csv = root / "train.csv"          # Kaggle "Store Item Demand" schema: date, store, item, sales
    hist[["date", "store", "item", "sales"]].to_csv(csv, index=False)
    out, art = root / "data", root / "art"
    pipeline.main(["--csv", str(csv), "--out", str(out), "--artifacts", str(art), "--quick", "--folds", "2"])
    return out, art


def test_pipeline_writes_all_exports(built):
    out, _ = built
    for name in ["meta", "leaderboard", "series", "business", "drift", "features"]:
        assert (out / f"{name}.json").exists()
    meta = json.loads((out / "meta.json").read_text())
    assert meta["dataset"]["n_series"] == 4 and meta["dataset"]["synthetic"] is False
    lb = json.loads((out / "leaderboard.json").read_text())
    assert {m["model"] for m in lb["metrics"]} == {"seasonal_naive", "ets", "lightgbm"}
    series = json.loads((out / "series.json").read_text())
    s = next(iter(series.values()))
    assert len(s["future"]["dates"]) == 28 and len(s["backtest"]["actual"]) == 28
    q = s["future"]["lightgbm_q"]
    for i in range(28):                                            # quantiles never cross
        vals = [q[k][i] for k in sorted(q, key=float)]
        assert vals == sorted(vals)


def test_api_matches_exported_forecast(built):
    out, art = built
    api.load_state(art)
    client = TestClient(api.app)
    assert client.get("/health").json()["status"] == "ok"
    series = json.loads((out / "series.json").read_text())
    key, s = next(iter(series.items()))
    r = client.get("/forecast", params={"store": s["store"], "item": s["item"], "horizon": 28})
    assert r.status_code == 200
    body = r.json()
    # the API and the exported JSON come from the same code path and the same model
    assert np.allclose(body["forecast"], s["future"]["lightgbm"], atol=0.1)
    assert body["dates"] == s["future"]["dates"]
    r7 = client.get("/forecast", params={"store": s["store"], "item": s["item"], "scenario": "promo7"}).json()
    assert np.allclose(r7["forecast"], s["future"]["promo7"]["lightgbm"], atol=0.1)


def test_api_errors(built):
    _, art = built
    api.load_state(art)
    client = TestClient(api.app)
    assert client.get("/forecast", params={"store": "nope", "item": "x"}).status_code == 404
    assert client.get("/forecast", params={"store": "S1", "item": "I1", "scenario": "bad"}).status_code == 422
    assert client.get("/forecast", params={"store": "S1", "item": "I1", "horizon": 99}).status_code == 422

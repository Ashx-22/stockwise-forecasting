import numpy as np
import pandas as pd

from stockwise.config import HORIZON
from stockwise.data import generate_synthetic
from stockwise.features import FEATURES, build_features, make_maps


def small():
    return generate_synthetic(n_stores=2, n_items=2, start="2023-01-01", end="2024-08-31", drift=False)


def test_generator_is_deterministic_and_valid():
    a, fa, _ = small()
    b, fb, _ = small()
    pd.testing.assert_frame_equal(a, b)
    assert (a["sales"] >= 0).all() and a["sales"].notna().all()
    assert a.groupby(["store", "item"]).size().nunique() == 1       # complete daily grid
    assert len(fa) == 4 * HORIZON and fa["date"].min() == a["date"].max() + pd.Timedelta(days=1)


def test_drift_is_injected_only_when_requested():
    with_drift, _, meta = generate_synthetic(n_stores=5, n_items=6, drift=True)
    assert meta["drift_injected"]
    _, _, meta2 = generate_synthetic(n_stores=2, n_items=2, drift=False)
    assert meta2["drift_injected"] == []


def test_features_have_no_lookahead():
    """Blank every sale after the origin: features for the next HORIZON days must not change."""
    hist, _, _ = small()
    sm, im = make_maps(hist)
    full = build_features(hist, sm, im)
    origin = hist["date"].max() - pd.Timedelta(days=60)
    blanked = hist.copy()
    blanked.loc[blanked["date"] > origin, "sales"] = np.nan
    cut = build_features(blanked, sm, im)
    window = (full["date"] > origin) & (full["date"] <= origin + pd.Timedelta(days=HORIZON))
    a = full.loc[window, FEATURES].reset_index(drop=True)
    b = cut.loc[cut["date"].between(origin + pd.Timedelta(days=1), origin + pd.Timedelta(days=HORIZON)), FEATURES].reset_index(drop=True)
    pd.testing.assert_frame_equal(a, b)


def test_features_do_change_when_lookahead_is_possible():
    """Sanity check on the test above: a 1-day shift WOULD leak, so the test is capable of failing."""
    hist, _, _ = small()
    sm, im = make_maps(hist)
    origin = hist["date"].max() - pd.Timedelta(days=60)
    blanked = hist.copy()
    blanked.loc[blanked["date"] > origin, "sales"] = np.nan
    leaky = blanked.copy()
    leaky["prev_day"] = 0
    full = build_features(hist, sm, im)
    day_after = full[full["date"] == origin + pd.Timedelta(days=HORIZON + 1)]
    cut = build_features(blanked, sm, im)
    day_after_cut = cut[cut["date"] == origin + pd.Timedelta(days=HORIZON + 1)]
    # one day beyond the horizon, lag_28 needs sales after the origin, so values must differ
    assert not day_after["lag_28"].reset_index(drop=True).equals(day_after_cut["lag_28"].reset_index(drop=True))

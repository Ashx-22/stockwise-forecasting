import numpy as np
import pytest

from stockwise.business import interp_quantile, policy_cost
from stockwise.drift import psi
from stockwise.metrics import bias, coverage, mase, wape


def test_wape_bias_coverage():
    y, f = [10, 20, 30], [12, 18, 30]
    assert wape(y, f) == pytest.approx(4 / 60)
    assert bias(y, [11, 21, 31]) == pytest.approx(3 / 60)
    assert coverage([1, 5, 9], [0, 0, 0], [2, 4, 10]) == pytest.approx(2 / 3)


def test_mase_scaling_and_zero_scale():
    train = np.arange(20, dtype=float)                 # weekly differences are all 7, so the scale is 7
    assert mase([0, 7], [0, 0], train) == pytest.approx(0.5)
    assert np.isnan(mase([1], [1], [5, 5, 5, 5, 5, 5, 5, 5]))       # zero scale gives nan, not a crash


def test_interp_quantile_matches_levels_and_clamps():
    q = np.array([[1.0, 2, 3, 4], [10, 20, 30, 40]])
    levels = [0.1, 0.5, 0.8, 0.9]
    assert list(interp_quantile(q, levels, 0.5)) == [2, 20]
    assert list(interp_quantile(q, levels, 0.65)) == pytest.approx([2.5, 25.0])
    assert list(interp_quantile(q, levels, 0.99)) == [4, 40]          # clamped to the highest level
    assert list(interp_quantile(q, levels, 0.01)) == [1, 10]


def test_policy_cost():
    r = policy_cost(np.array([10, 5]), np.array([8, 9]), holding=1, stockout=4)
    assert r["cost"] == 2 * 1 + 4 * 4
    assert r["fill_rate"] == pytest.approx(13 / 17)


def test_psi_detects_shift_and_ignores_identical():
    rng = np.random.default_rng(0)
    a = rng.normal(0, 1, 2000)
    assert psi(a, rng.normal(0, 1, 2000)) < 0.05
    assert psi(a, rng.normal(1.5, 1, 2000)) > 0.25

import numpy as np
import pandas as pd

from core.trolololo import (
    compute_trolololo,
    compute_trolololo_bands,
    get_channel_params,
    get_cycle_marks,
)


def _make_btc_series(start: str, end: str) -> pd.Series:
    """Create a deterministic synthetic BTC price series spanning multiple cycles."""
    dates = pd.date_range(start, end, freq="D")
    days = (dates - pd.Timestamp("2012-01-01")).days.values.astype(float)
    base = np.exp(np.log(10.0) * (2.84 * np.log(days + 1300.0) - 19.463))
    cycle = np.exp(0.6 * np.sin(2.0 * np.pi * days / 1460.0))
    return pd.Series(base * cycle, index=dates, name="btc_close")


def test_trolololo_computation_properties():
    """Verify that Trolololo outputs a Series bounded within [0, 100] with matching DatetimeIndex."""
    dates = pd.date_range("2015-01-01", periods=1000, freq="D")
    days = np.arange(1000, dtype=float)
    prices = 200.0 * np.exp(0.003 * days) + 50.0 * np.sin(days / 30.0)
    btc_series = pd.Series(prices, index=dates, name="btc_close")

    result = compute_trolololo(btc_series)
    assert isinstance(result, pd.Series)
    assert len(result) == len(btc_series)
    assert result.index.equals(btc_series.index)

    valid_vals = result.dropna()
    assert (valid_vals >= 0.0).all()
    assert (valid_vals <= 100.0).all()


def test_cycle_marks_shape():
    """Verify high and low mark boolean arrays match price series length."""
    dates = pd.date_range("2015-01-01", periods=500, freq="D")
    prices = pd.Series(np.linspace(300.0, 10000.0, 500), index=dates)

    high_marks, low_marks = get_cycle_marks(prices)
    assert len(high_marks) == len(prices)
    assert len(low_marks) == len(prices)
    assert high_marks.dtype == bool
    assert low_marks.dtype == bool


def test_channel_params_keys():
    """Verify get_channel_params returns expected diagnostic dictionary."""
    dates = pd.date_range("2015-01-01", periods=800, freq="D")
    prices = pd.Series(np.linspace(500.0, 20000.0, 800), index=dates)

    params = get_channel_params(prices)
    assert "origin_date" in params
    assert "n_high_marks" in params
    assert "n_low_marks" in params


def test_trolololo_d_raw_invariance_across_start_dates():
    """
    Verify OLS drift regression uses calendar days (d_raw) rather than array position.

    Two series starting on different dates that include the exact same confirmed cycle marks
    (2015-01-14, 2017-12-17, 2018-12-15, 2021-11-10, 2022-11-21) must produce identical
    channel slopes/intercepts and identical Trolololo values on their overlapping dates.
    """
    full = _make_btc_series("2014-01-01", "2024-01-01")
    later = full.loc["2014-09-17":].copy()

    sig_full = compute_trolololo(full)
    sig_later = compute_trolololo(later)

    np.testing.assert_allclose(
        sig_full.loc[later.index].values,
        sig_later.values,
        rtol=1e-12,
        atol=1e-12,
    )

    params_full = get_channel_params(full)
    params_later = get_channel_params(later)
    assert params_full["top_drift_slope"] == params_later["top_drift_slope"]
    assert params_full["top_drift_intercept"] == params_later["top_drift_intercept"]
    assert params_full["bottom_drift_slope"] == params_later["bottom_drift_slope"]
    assert params_full["bottom_drift_intercept"] == params_later["bottom_drift_intercept"]


def test_compute_trolololo_bands_contract():
    """Verify compute_trolololo_bands returns USD-space (top_band, bottom_band) matching index."""
    btc = _make_btc_series("2014-09-17", "2024-01-01")

    top_band, bottom_band = compute_trolololo_bands(btc)
    assert isinstance(top_band, pd.Series)
    assert isinstance(bottom_band, pd.Series)
    assert top_band.index.equals(btc.index)
    assert bottom_band.index.equals(btc.index)
    assert np.isfinite(top_band).all()
    assert np.isfinite(bottom_band).all()
    assert (top_band > bottom_band).all()
    assert (bottom_band > 0.0).all()

    # Cross-check normalization consistency: log(price) between log(bottom) and log(top)
    expected = np.clip(
        (np.log(btc.values) - np.log(bottom_band.values))
        / (np.log(top_band.values) - np.log(bottom_band.values)),
        0.0,
        1.0,
    ) * 100.0
    actual = compute_trolololo(btc).values
    np.testing.assert_allclose(actual, expected, rtol=1e-12, atol=1e-12)

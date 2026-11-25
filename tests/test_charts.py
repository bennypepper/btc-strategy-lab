import numpy as np
import pandas as pd
import plotly.graph_objects as go

from core.charts import (
    build_equity_chart,
    build_is_oos_equity_chart,
    build_regression_bands_chart,
    build_sensitivity_heatmap,
    build_signal_chart,
)
from core.models import (
    BacktestParameters,
    BenchmarkMetrics,
    SimulationResult,
    StrategyMetrics,
)


def _dummy_result(portfolio_values: list[float], bh_values: list[float]) -> SimulationResult:
    dates = pd.date_range("2020-01-01", periods=len(portfolio_values), freq="W")
    ph = pd.DataFrame(
        {
            "portfolio_value": portfolio_values,
            "buy_and_hold_value": bh_values,
        },
        index=dates,
    )
    return SimulationResult(
        params=BacktestParameters(10, 80, 0.1, 0.1),
        metrics=StrategyMetrics(0.1, 0.1, 1.0, 0.5, 0),
        benchmark_metrics=BenchmarkMetrics(0.1, 0.1, 1.0, 100000.0),
        portfolio_history=ph,
        trade_log=pd.DataFrame(
            columns=[
                "Date",
                "Action",
                "BTC Price",
                "Amount (USD)",
                "BTC Amount",
                "Signal Index",
                "Cash After",
                "BTC Held After",
                "Equity After",
            ]
        ),
        low_sample_warning=True,
    )


def test_build_signal_chart_preserves_zero_signal():
    dates = pd.date_range("2020-01-01", periods=5, freq="D")
    df = pd.DataFrame({"trolololo": [0.0, 15.0, 50.0, 85.0, 0.0]}, index=dates)

    fig = build_signal_chart(df, threshold_buy=20, threshold_sell=80)
    sig_trace = next(t for t in fig.data if t.name == "Regression Index")
    y_vals = list(sig_trace.y)
    assert len(y_vals) == 5
    assert y_vals[0] == 0.0
    assert y_vals[-1] == 0.0


def test_build_signal_chart_empty_df_does_not_crash():
    dates = pd.DatetimeIndex([], name="date")
    df = pd.DataFrame({"trolololo": pd.Series([], dtype=float)}, index=dates)
    fig = build_signal_chart(df, threshold_buy=20, threshold_sell=80)
    assert isinstance(fig, go.Figure)


def test_build_equity_chart_empty_or_zero_vals_does_not_crash():
    res_zero = _dummy_result([0.0, 0.0], [0.0, 0.0])
    fig = build_equity_chart(res_zero)
    assert isinstance(fig, go.Figure)

    res_empty = _dummy_result([], [])
    fig_empty = build_equity_chart(res_empty)
    assert isinstance(fig_empty, go.Figure)


def test_build_is_oos_equity_chart_oos_fill_is_none():
    vals = [100_000.0 + i * 1000.0 for i in range(120)]
    dates = pd.date_range("2020-01-01", periods=len(vals), freq="W")
    ph = pd.DataFrame({"portfolio_value": vals, "buy_and_hold_value": vals}, index=dates)
    res = SimulationResult(
        params=BacktestParameters(10, 80, 0.1, 0.1),
        metrics=StrategyMetrics(0.1, 0.1, 1.0, 0.5, 0),
        benchmark_metrics=BenchmarkMetrics(0.1, 0.1, 1.0, 100000.0),
        portfolio_history=ph,
        trade_log=pd.DataFrame(),
        low_sample_warning=True,
    )
    fig = build_is_oos_equity_chart(res, split_date="2021-01-01")
    oos_trace = next(t for t in fig.data if "OOS" in (t.name or ""))
    assert oos_trace.fill == "none"


def test_build_sensitivity_heatmap_empty_and_all_nan():
    empty_df = pd.DataFrame()
    fig_empty = build_sensitivity_heatmap(empty_df)
    assert isinstance(fig_empty, go.Figure)

    nan_df = pd.DataFrame([[np.nan, np.nan], [np.nan, np.nan]], index=[60, 70], columns=[10, 20])
    fig_nan = build_sensitivity_heatmap(nan_df)
    assert isinstance(fig_nan, go.Figure)


def test_build_regression_bands_chart_empty_df():
    empty_df = pd.DataFrame({"btc_close": pd.Series([], dtype=float)}, index=pd.DatetimeIndex([]))
    fig = build_regression_bands_chart(empty_df)
    assert isinstance(fig, go.Figure)


def test_build_regression_bands_chart_with_data_matches_compute_trolololo_bands():
    from core.data_loader import load_static_dataset
    from core.trolololo import compute_trolololo_bands

    df = load_static_dataset()
    fig = build_regression_bands_chart(df)
    names = {t.name for t in fig.data}
    assert {"Bottom Band", "Top Band", "BTC Price"}.issubset(names)

    expected_top, expected_bot = compute_trolololo_bands(df["btc_close"])
    top_trace = next(t for t in fig.data if t.name == "Top Band")
    bot_trace = next(t for t in fig.data if t.name == "Bottom Band")
    assert np.allclose(np.asarray(top_trace.y, dtype=float), expected_top.values, equal_nan=True)
    assert np.allclose(np.asarray(bot_trace.y, dtype=float), expected_bot.values, equal_nan=True)

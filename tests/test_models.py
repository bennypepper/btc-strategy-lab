import pytest
from core.models import BacktestParameters, StrategyMetrics, BenchmarkMetrics

def test_backtest_parameters_valid():
    params = BacktestParameters(
        threshold_buy=20,
        threshold_sell=80,
        alloc_buy_pct=0.15,
        alloc_sell_pct=0.20,
        initial_cash=50000.0,
        fee_rate=0.001,
    )
    assert params.threshold_buy == 20
    assert params.threshold_sell == 80
    assert params["alloc_buy_pct"] == 0.15
    assert params.get("fee_rate") == 0.001
    assert params.to_dict()["initial_cash"] == 50000.0

def test_backtest_parameters_invalid_thresholds():
    with pytest.raises(ValueError, match="strictly less than"):
        BacktestParameters(
            threshold_buy=80,
            threshold_sell=80,
            alloc_buy_pct=0.1,
            alloc_sell_pct=0.1,
        )

def test_backtest_parameters_invalid_allocation():
    with pytest.raises(ValueError, match="alloc_buy_pct"):
        BacktestParameters(
            threshold_buy=20,
            threshold_sell=80,
            alloc_buy_pct=0.0,
            alloc_sell_pct=0.1,
        )

def test_strategy_metrics_dict_access():
    metrics = StrategyMetrics(
        total_return=1.5,
        max_drawdown=0.25,
        sharpe_ratio=1.85,
        win_rate=0.75,
        trade_count=42,
    )
    assert metrics["total_return"] == 1.5
    assert metrics.get("max_drawdown") == 0.25
    assert metrics.sharpe_ratio == 1.85
    assert metrics.to_dict()["trade_count"] == 42

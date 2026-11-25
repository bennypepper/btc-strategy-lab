"""
core/models.py
==============
Domain models and schema contracts for the BTC Strategy Lab.
Adheres to The Pragmatic Systems Handbook (Sections 1.2, 2.5).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class BacktestParameters:
    """Strongly typed, validated parameters for a simulation run."""
    threshold_buy: int
    threshold_sell: int
    alloc_buy_pct: float
    alloc_sell_pct: float
    initial_cash: float = 100_000.0
    fee_rate: float = 0.001
    signal_column: str = "trolololo"

    def __post_init__(self) -> None:
        if self.threshold_buy >= self.threshold_sell:
            raise ValueError(
                f"threshold_buy ({self.threshold_buy}) must be strictly less than "
                f"threshold_sell ({self.threshold_sell})"
            )
        if not (0.0 < self.alloc_buy_pct <= 1.0):
            raise ValueError(f"alloc_buy_pct ({self.alloc_buy_pct}) must be in (0.0, 1.0]")
        if not (0.0 < self.alloc_sell_pct <= 1.0):
            raise ValueError(f"alloc_sell_pct ({self.alloc_sell_pct}) must be in (0.0, 1.0]")
        if self.initial_cash <= 0.0:
            raise ValueError(f"initial_cash ({self.initial_cash}) must be positive")
        if not (0.0 <= self.fee_rate <= 0.10):
            raise ValueError(f"fee_rate ({self.fee_rate}) must be between 0.0 and 0.10")

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError:
            raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class StrategyMetrics:
    """Performance evaluation metrics for an active strategy."""
    total_return: float
    max_drawdown: float
    sharpe_ratio: float
    win_rate: float
    trade_count: int
    max_drawdown_date: str = ""
    buy_count: int = 0
    sell_count: int = 0
    final_cash: float = 0.0
    final_btc: float = 0.0
    final_portfolio_value: float = 0.0

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError:
            raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class BenchmarkMetrics:
    """Performance metrics for the Buy and Hold baseline benchmark."""
    total_return: float
    max_drawdown: float
    sharpe_ratio: float
    final_value: float = 0.0

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError:
            raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SimulationResult:
    """Comprehensive result of a simulation run."""
    portfolio_history: pd.DataFrame
    trade_log: pd.DataFrame
    metrics: StrategyMetrics
    benchmark_metrics: BenchmarkMetrics
    low_sample_warning: bool
    params: BacktestParameters

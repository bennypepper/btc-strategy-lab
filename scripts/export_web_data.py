"""
scripts/export_web_data.py
==========================
Export canonical BTC Strategy Lab research artifacts and golden parity fixtures
into the Next.js application (`web/public/data/` and `web/src/lib/__fixtures__/`).

Ensures Python (`core/trolololo.py`, `core/engine.py`) remains the single
mathematical source of truth for the TypeScript/Next.js frontend.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from core.engine import run_backtest_full
from core.trolololo import compute_trolololo, compute_trolololo_bands


def _clean_float(val: Any) -> float | None:
    if val is None:
        return None
    f = float(val)
    return None if not math.isfinite(f) else f


def _write_json(path: Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    else:
        text = json.dumps(payload, indent=2, allow_nan=False) + "\n"
    path.write_text(text, encoding="utf-8")


def _export_master_dataset(df: pd.DataFrame, out_path: Path) -> None:
    payload = {
        "dates": [ts.strftime("%Y-%m-%d") for ts in df.index],
        "btc_open": [round(float(v), 6) for v in df["btc_open"].to_numpy()],
        "btc_close": [round(float(v), 6) for v in df["btc_close"].to_numpy()],
        "trolololo": [
            None if not math.isfinite(float(v)) else round(float(v), 6)
            for v in df["trolololo"].to_numpy()
        ],
    }
    _write_json(out_path, payload, compact=True)


def _export_heatmap(parquet_path: Path, out_path: Path) -> None:
    pivot = pd.read_parquet(parquet_path)
    payload = {
        "xLabels": [int(c) for c in pivot.columns],
        "yLabels": [int(r) for r in pivot.index],
        "values": [
            [_clean_float(cell) for cell in row]
            for row in pivot.to_numpy()
        ],
    }
    _write_json(out_path, payload, compact=True)


def _export_top100(csv_path: Path, out_path: Path) -> None:
    df = pd.read_csv(csv_path)
    records = []
    for row in df.to_dict(orient="records"):
        records.append(
            {
                "threshold_buy": int(row["threshold_buy"]),
                "threshold_sell": int(row["threshold_sell"]),
                "allocation_buy_pct": float(row["allocation_buy_pct"]),
                "allocation_sell_pct": float(row["allocation_sell_pct"]),
                "total_return": float(row["total_return"]),
                "max_drawdown": float(row["max_drawdown"]),
                "sharpe_ratio": float(row["sharpe_ratio"]),
                "win_rate": float(row["win_rate"]),
                "trade_count": int(row["trade_count"]),
            }
        )
    _write_json(out_path, records, compact=True)


def _build_golden_parity_fixture(df: pd.DataFrame) -> dict[str, Any]:
    trol = compute_trolololo(df["btc_close"])
    top_band, bottom_band = compute_trolololo_bands(df["btc_close"])

    sample_indices = sorted(
        {
            0,
            1,
            100,
            322,
            464,
            699,
            1109,
            2177,
            2540,
            3287,
            3288,
            3601,
            3977,
            4500,
            len(df) - 1,
        }
        & set(range(len(df)))
    )
    trolololo_samples = [
        {
            "index": idx,
            "date": df.index[idx].strftime("%Y-%m-%d"),
            "trolololo": _clean_float(trol.iloc[idx]),
            "topBand": _clean_float(top_band.iloc[idx]),
            "bottomBand": _clean_float(bottom_band.iloc[idx]),
        }
        for idx in sample_indices
    ]

    scenario_specs = [
        {
            "name": "s1_is_max_return",
            "start": "2012-01-01",
            "end": "2020-12-31",
            "thresholdBuy": 9,
            "thresholdSell": 99,
            "allocBuyPct": 0.25,
            "allocSellPct": 0.17,
            "initialCash": 100_000.0,
            "feeRate": 0.001,
        },
        {
            "name": "s1_oos_max_return",
            "start": "2021-01-01",
            "end": "2026-03-15",
            "thresholdBuy": 9,
            "thresholdSell": 99,
            "allocBuyPct": 0.25,
            "allocSellPct": 0.17,
            "initialCash": 100_000.0,
            "feeRate": 0.001,
        },
        {
            "name": "s2_full_max_return",
            "start": "2012-01-01",
            "end": "2026-03-15",
            "thresholdBuy": 7,
            "thresholdSell": 96,
            "allocBuyPct": 0.25,
            "allocSellPct": 0.14,
            "initialCash": 100_000.0,
            "feeRate": 0.001,
        },
        {
            "name": "s2_full_max_sharpe",
            "start": "2012-01-01",
            "end": "2026-03-15",
            "thresholdBuy": 4,
            "thresholdSell": 59,
            "allocBuyPct": 0.25,
            "allocSellPct": 0.03,
            "initialCash": 100_000.0,
            "feeRate": 0.001,
        },
        {
            "name": "custom_moderate_2018_2024",
            "start": "2018-01-01",
            "end": "2024-12-31",
            "thresholdBuy": 20,
            "thresholdSell": 75,
            "allocBuyPct": 0.10,
            "allocSellPct": 0.10,
            "initialCash": 50_000.0,
            "feeRate": 0.002,
        },
    ]

    scenarios_out = []
    for spec in scenario_specs:
        sliced = df.loc[
            (df.index >= pd.Timestamp(spec["start"]))
            & (df.index <= pd.Timestamp(spec["end"]))
        ].copy()
        res = run_backtest_full(
            sliced,
            threshold_buy=spec["thresholdBuy"],
            threshold_sell=spec["thresholdSell"],
            alloc_buy_pct=spec["allocBuyPct"],
            alloc_sell_pct=spec["allocSellPct"],
            initial_cash=spec["initialCash"],
            fee_rate=spec["feeRate"],
        )
        m = res.metrics
        bm = res.benchmark_metrics
        tlog = res.trade_log
        first_trade = None
        last_trade = None
        if not tlog.empty:
            ft = tlog.iloc[0]
            lt = tlog.iloc[-1]
            first_trade = {
                "date": pd.Timestamp(ft["Date"]).strftime("%Y-%m-%d"),
                "action": str(ft["Action"]),
                "btcPrice": float(ft["BTC Price"]),
                "amountUsd": float(ft["Amount (USD)"]),
                "btcAmount": float(ft["BTC Amount"]),
                "signalIndex": float(ft["Signal Index"]),
            }
            last_trade = {
                "date": pd.Timestamp(lt["Date"]).strftime("%Y-%m-%d"),
                "action": str(lt["Action"]),
                "btcPrice": float(lt["BTC Price"]),
                "amountUsd": float(lt["Amount (USD)"]),
                "btcAmount": float(lt["BTC Amount"]),
                "signalIndex": float(lt["Signal Index"]),
            }

        scenarios_out.append(
            {
                "spec": spec,
                "metrics": {
                    "totalReturn": float(m.total_return),
                    "maxDrawdown": float(m.max_drawdown),
                    "maxDrawdownDate": str(m.max_drawdown_date),
                    "sharpeRatio": float(m.sharpe_ratio),
                    "winRate": float(m.win_rate),
                    "tradeCount": int(m.trade_count),
                    "buyCount": int(m.buy_count),
                    "sellCount": int(m.sell_count),
                    "finalCash": float(m.final_cash),
                    "finalBtc": float(m.final_btc),
                    "finalPortfolioValue": float(m.final_portfolio_value),
                },
                "benchmarkMetrics": {
                    "totalReturn": float(bm.total_return),
                    "maxDrawdown": float(bm.max_drawdown),
                    "sharpeRatio": float(bm.sharpe_ratio),
                    "finalValue": float(bm.final_value),
                },
                "lowSampleWarning": bool(res.low_sample_warning),
                "historyLength": len(res.portfolio_history),
                "firstTrade": first_trade,
                "lastTrade": last_trade,
            }
        )

    return {
        "datasetRowCount": len(df),
        "trolololoSamples": trolololo_samples,
        "scenarios": scenarios_out,
    }


def export_all(root: Path = _ROOT) -> dict[str, Path]:
    data_dir = root / "data"
    research_dir = data_dir / "research"
    web_data_dir = root / "web" / "public" / "data"
    fixture_path = root / "web" / "src" / "lib" / "__fixtures__" / "golden_parity.json"

    df = pd.read_parquet(data_dir / "master_dataset.parquet")
    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index)
    df = df.sort_index()

    outputs: dict[str, Path] = {}

    master_out = web_data_dir / "master_dataset.json"
    _export_master_dataset(df, master_out)
    outputs["master_dataset"] = master_out

    for json_name in ("optimal_params_summary.json", "live_optimal_params.json"):
        src = data_dir / json_name
        dst = web_data_dir / json_name
        parsed = json.loads(src.read_text(encoding="utf-8"))
        _write_json(dst, parsed, compact=False)
        outputs[json_name] = dst

    for scen in (1, 2):
        hm_out = web_data_dir / f"s{scen}_heatmap_total_return.json"
        _export_heatmap(
            research_dir / f"s{scen}_heatmap_total_return.parquet",
            hm_out,
        )
        outputs[f"s{scen}_heatmap"] = hm_out

        top_out = web_data_dir / f"s{scen}_top100_max_return.json"
        _export_top100(
            research_dir / f"s{scen}_top100_max_return.csv",
            top_out,
        )
        outputs[f"s{scen}_top100"] = top_out

    # Use exact rounded values from master_dataset.json for golden parity so
    # TypeScript loading master_dataset.json matches Python to machine epsilon.
    exported = json.loads(master_out.read_text(encoding="utf-8"))
    df_exported = pd.DataFrame(
        {
            "btc_open": exported["btc_open"],
            "btc_close": exported["btc_close"],
            "trolololo": [
                np.nan if v is None else float(v) for v in exported["trolololo"]
            ],
        },
        index=pd.to_datetime(exported["dates"]),
    )
    fixture = _build_golden_parity_fixture(df_exported)
    _write_json(fixture_path, fixture, compact=False)
    outputs["golden_parity"] = fixture_path

    return outputs


def main() -> None:
    outputs = export_all()
    for name, path in outputs.items():
        size_kb = path.stat().st_size / 1024.0
        print(f"Exported {name}: {path.relative_to(_ROOT)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()

import datetime as dt
import re
from pathlib import Path

import pandas as pd
import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

import core.data_loader as dl
from core.keepalive import inject_keepalive
from core.styles import _GLOBAL_CSS, inject_css

ROOT = Path(__file__).resolve().parents[1]


def test_keepalive_clamps_interval_and_uses_location_origin(monkeypatch):
    captured = {}

    def _fake_html(body, height=0, width=0):
        captured["body"] = body

    monkeypatch.setattr("core.keepalive.components.html", _fake_html)
    inject_keepalive(interval_seconds=5)
    body = captured["body"]
    assert "30000" in body
    assert "window.location.origin" in body
    assert "'*'" not in body


def test_styles_defines_css_variables_and_noopener(monkeypatch):
    for var in ("--accent", "--muted", "--text", "--bg-card", "--bg-secondary", "--border"):
        assert var in _GLOBAL_CSS

    sidebar_calls = []

    class _FakeSidebar:
        def markdown(self, text, **kwargs):
            sidebar_calls.append(text)

    monkeypatch.setattr("core.styles.st.markdown", lambda *a, **kw: None)
    monkeypatch.setattr("core.styles.st.sidebar", _FakeSidebar())
    inject_css()
    footer_html = "\n".join(sidebar_calls)
    assert "target='_blank'" in footer_html
    assert "noopener noreferrer" in footer_html


def test_app_smoke_offline_mode(monkeypatch):
    st.cache_data.clear()
    st.cache_resource.clear()
    monkeypatch.setattr(dl.yf, "download", lambda *a, **kw: (_ for _ in ()).throw(OSError("offline")))
    at = AppTest.from_file(str(ROOT / "app.py"), default_timeout=30)
    at.run()
    assert not at.exception
    # Check warmup_numba is not imported in app.py
    app_src = (ROOT / "app.py").read_text(encoding="utf-8")
    assert "warmup_numba" not in app_src
    # Should reflect offline mode from attrs["is_live"] == False
    markdown_text = "\n".join(m.value for m in at.markdown)
    assert "Offline Mode" in markdown_text


def test_simulator_smoke_few_trades_no_slider_crash(monkeypatch):
    monkeypatch.setattr(dl.yf, "download", lambda *a, **kw: pd.DataFrame())
    at = AppTest.from_file(str(ROOT / "pages" / "1_Simulator.py"), default_timeout=30)
    at.run()
    assert not at.exception

    # Configure inputs to yield 1 <= n_trades <= 10 (where st.slider would crash if called)
    at.slider[0].set_value(45)   # threshold_buy
    at.slider[1].set_value(70)   # threshold_sell
    at.slider[2].set_value(100)  # alloc_buy = 100% -> 1 buy consumes all cash
    at.slider[3].set_value(100)  # alloc_sell = 100%
    at.date_input[0].set_value(dt.date(2023, 3, 1))
    at.date_input[1].set_value(dt.date(2024, 5, 1))
    at.button[0].click()
    at.run()
    assert not at.exception
    tlog = at.session_state["sim_result"].trade_log
    assert 1 <= len(tlog) <= 10
    assert at.session_state["sim_params"]["scenario_slug"] == "maximum_return"
    assert len(at.dataframe) >= 1


def test_simulator_clamps_hold_zone_when_buy_exceeds_sell(monkeypatch):
    monkeypatch.setattr(dl.yf, "download", lambda *a, **kw: pd.DataFrame())
    at = AppTest.from_file(str(ROOT / "pages" / "1_Simulator.py"), default_timeout=30)
    at.run()
    at.slider[0].set_value(80)
    at.slider[1].set_value(60)
    at.run()
    assert not at.exception
    md_text = "\n".join(m.value for m in at.markdown)
    assert "Hold Zone (0 pts)" in md_text


def test_research_results_smoke(monkeypatch):
    monkeypatch.setattr(dl.yf, "download", lambda *a, **kw: pd.DataFrame())
    at = AppTest.from_file(str(ROOT / "pages" / "2_Research_Results.py"), default_timeout=30)
    at.run()
    assert not at.exception

    md_text = "\n".join(m.value for m in at.markdown)
    assert "Pre-aggregated from 1,293,750 parameter combinations." in md_text

    # Trigger heatmap and Top-100 CSV buttons powered by data/research/
    for key in ("load_s1_hm", "load_s2_hm"):
        at.button(key=key).click()
        at.run()
        assert not at.exception

    for btn in at.button:
        if btn.label in ("Prepare S1 Top-100 CSV", "Prepare S2 Top-100 CSV"):
            btn.click()
            at.run()
            assert not at.exception


def test_documentation_smoke():
    at = AppTest.from_file(str(ROOT / "pages" / "3_Documentation.py"), default_timeout=30)
    at.run()
    assert not at.exception
    doc_text = "\n".join(m.value for m in at.markdown)
    assert "5,188" in doc_text
    assert "sidebar toggle" not in doc_text.lower()
    assert "Index ≤ Buy Threshold" in doc_text or "<=" in doc_text or "≤" in doc_text


def test_optimizer_smoke_locked_and_copy(monkeypatch):
    monkeypatch.delenv("BTC_LAB_ADMIN_PASSCODE", raising=False)
    at = AppTest.from_file(str(ROOT / "pages" / "4_Optimizer.py"), default_timeout=30)
    at.run()
    assert not at.exception
    # Locked public mode: no passcode input rendered and Run Optimization button is disabled
    assert len(at.date_input) >= 1
    assert len(at.text_input) == 0
    run_buttons = [b for b in at.button if "Run Optimization" in b.label]
    assert len(run_buttons) == 1
    assert run_buttons[0].disabled is True
    info_text = "\n".join(i.value for i in at.info)
    assert "public read-only mode" in info_text

    # fee_rate number_input should have max_value <= 0.10
    fee_inputs = [ni for ni in at.number_input if "Fee" in ni.label]
    assert len(fee_inputs) == 1
    assert fee_inputs[0].max == pytest.approx(0.10)
    opt_text = "\n".join(m.value for m in at.markdown)
    assert "step 1" in opt_text
    assert "O(1)-RAM" in opt_text
    assert "regenerate_artifacts.py" in opt_text
    assert "Live Data" not in opt_text
    # Ensure no raw Exception leakage in source
    opt_src = (ROOT / "pages" / "4_Optimizer.py").read_text(encoding="utf-8")
    assert "st.exception(" not in opt_src
    assert not re.search(r"st\.error\(f.*\{e\}", opt_src)


def test_optimizer_admin_passcode_unlock(monkeypatch):
    monkeypatch.setenv("BTC_LAB_ADMIN_PASSCODE", "correct-horse-passcode")
    at = AppTest.from_file(str(ROOT / "pages" / "4_Optimizer.py"), default_timeout=30)
    at.run()
    assert not at.exception

    # Passcode input rendered; button disabled until correct passcode entered
    assert len(at.text_input) == 1
    run_btn = next(b for b in at.button if "Run Optimization" in b.label)
    assert run_btn.disabled is True

    # Wrong passcode shows warning and keeps button disabled
    at.text_input(key="opt_admin_passcode").set_value("wrong-passcode")
    at.run()
    assert not at.exception
    assert any("Incorrect admin passcode" in w.value for w in at.warning)
    run_btn = next(b for b in at.button if "Run Optimization" in b.label)
    assert run_btn.disabled is True

    # Correct passcode unlocks Run Optimization button
    at.text_input(key="opt_admin_passcode").set_value("correct-horse-passcode")
    at.run()
    assert not at.exception
    assert not any("Incorrect admin passcode" in w.value for w in at.warning)
    run_btn = next(b for b in at.button if "Run Optimization" in b.label)
    assert run_btn.disabled is False

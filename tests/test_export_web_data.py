import json
from pathlib import Path

from scripts.export_web_data import export_all


def test_export_web_data_produces_valid_json_and_fixtures():
    repo_root = Path(__file__).resolve().parents[1]
    outputs = export_all(repo_root)

    master = json.loads(outputs["master_dataset"].read_text(encoding="utf-8"))
    assert len(master["dates"]) == 5188
    assert len(master["btc_open"]) == 5188
    assert len(master["btc_close"]) == 5188
    assert len(master["trolololo"]) == 5188
    assert master["trolololo"][0] is None
    assert master["trolololo"][1] is not None

    hm1 = json.loads(outputs["s1_heatmap"].read_text(encoding="utf-8"))
    assert len(hm1["xLabels"]) == 45
    assert len(hm1["yLabels"]) == 46
    assert len(hm1["values"]) == 46

    top1 = json.loads(outputs["s1_top100"].read_text(encoding="utf-8"))
    assert len(top1) == 100

    golden = json.loads(outputs["golden_parity"].read_text(encoding="utf-8"))
    assert golden["datasetRowCount"] == 5188
    assert len(golden["trolololoSamples"]) >= 10
    assert len(golden["scenarios"]) == 5

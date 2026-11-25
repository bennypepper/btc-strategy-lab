from core.utils import format_currency, format_number, format_percentage


def test_format_percentage():
    assert format_percentage(50.5, decimal_places=1) == "+50.5%"
    assert format_percentage(0.0) == "0.0%"
    assert format_percentage(-25.2, decimal_places=1) == "-25.2%"
    assert format_percentage(1500.0) == "+1,500%"
    assert format_percentage(-1500.0) == "-1,500%"
    assert format_percentage(2_500_000.0) == "+2.50M%"
    assert format_percentage(-2_500_000.0) == "-2.50M%"
    assert format_percentage(3_000_000_000.0) == "+3.00B%"
    assert format_percentage(4_000_000_000_000.0) == "+4.00T%"


def test_format_currency():
    assert format_currency(150.55) == "$150.55"
    assert format_currency(-150.55) == "-$150.55"
    assert format_currency(15000.0) == "$15,000"
    assert format_currency(1_500_000.0) == "$1.50M"
    assert format_currency(2_500_000_000.0) == "$2.50B"


def test_format_number():
    assert format_number(0.0) == "0"
    assert format_number(1.5, decimal_places=2) == "1.5"
    assert format_number(100.0) == "100"
    assert format_number(1500.0) == "1.50K"
    assert format_number(-2500000.0) == "-2.50M"

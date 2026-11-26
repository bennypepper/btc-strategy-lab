import { describe, expect, it } from "vitest";
import {
  formatCompactDollar,
  formatCompactPercent,
  formatCurrency,
  formatNumber,
  formatPercentage,
} from "../format";

describe("formatPercentage", () => {
  it("formats zero with requested decimal places", () => {
    expect(formatPercentage(0)).toBe("0.0%");
    expect(formatPercentage(0, 2)).toBe("0.00%");
    expect(formatPercentage(0, 0)).toBe("0%");
  });

  it("formats sub-1K positive and negative percentages with sign and decimals", () => {
    expect(formatPercentage(150.5)).toBe("+150.5%");
    expect(formatPercentage(-42.34, 2)).toBe("-42.34%");
    expect(formatPercentage(999.9, 1)).toBe("+999.9%");
  });

  it("formats 1K to 1M percentages with commas and zero decimals", () => {
    expect(formatPercentage(1500)).toBe("+1,500%");
    expect(formatPercentage(-12345.6)).toBe("-12,346%");
    expect(formatPercentage(999999)).toBe("+999,999%");
  });

  it("formats M, B, and T magnitude percentages", () => {
    expect(formatPercentage(1_500_000)).toBe("+1.50M%");
    expect(formatPercentage(-2_340_000_000)).toBe("-2.34B%");
    expect(formatPercentage(3_250_000_000_000)).toBe("+3.25T%");
  });
});

describe("formatCurrency", () => {
  it("formats sub-$1K values with two decimals", () => {
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(150.55)).toBe("$150.55");
    expect(formatCurrency(-42.5)).toBe("-$42.50");
  });

  it("formats $1K to $1M values with commas and zero decimals", () => {
    expect(formatCurrency(1000)).toBe("$1,000");
    expect(formatCurrency(15000)).toBe("$15,000");
    expect(formatCurrency(-999999)).toBe("-$999,999");
  });

  it("formats M, B, and T currency values", () => {
    expect(formatCurrency(1_500_000)).toBe("$1.50M");
    expect(formatCurrency(-12_727_445_352)).toBe("-$12.73B");
    expect(formatCurrency(1_250_000_000_000)).toBe("$1.25T");
  });
});

describe("formatNumber", () => {
  it("formats exact integers without trailing decimals", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(-7)).toBe("-7");
  });

  it("strips trailing zeros for fractional crypto amounts", () => {
    expect(formatNumber(1.25)).toBe("1.25");
    expect(formatNumber(0.000316, 6)).toBe("0.000316");
    expect(formatNumber(0.12345678, 4)).toBe("0.1235");
  });

  it("abbreviates K, M, B, and T magnitudes", () => {
    expect(formatNumber(1_500)).toBe("1.50K");
    expect(formatNumber(2_500_000)).toBe("2.50M");
    expect(formatNumber(-3_500_000_000)).toBe("-3.50B");
    expect(formatNumber(4_500_000_000_000)).toBe("4.50T");
  });
});

describe("formatCompactDollar", () => {
  it("formats log-scale chart axis dollar ticks cleanly", () => {
    expect(formatCompactDollar(0)).toBe("$0");
    expect(formatCompactDollar(100)).toBe("$100");
    expect(formatCompactDollar(1_000)).toBe("$1K");
    expect(formatCompactDollar(10_000)).toBe("$10K");
    expect(formatCompactDollar(1_000_000)).toBe("$1M");
    expect(formatCompactDollar(1_000_000_000)).toBe("$1B");
    expect(formatCompactDollar(1_000_000_000_000)).toBe("$1T");
  });

  it("handles negative and non-power-of-ten compact dollar values", () => {
    expect(formatCompactDollar(-10_000)).toBe("-$10K");
    expect(formatCompactDollar(2_500)).toBe("$2.5K");
  });
});

describe("formatCompactPercent", () => {
  it("formats log-scale return ticks cleanly", () => {
    expect(formatCompactPercent(0)).toBe("0%");
    expect(formatCompactPercent(1)).toBe("1%");
    expect(formatCompactPercent(100)).toBe("100%");
    expect(formatCompactPercent(10_000)).toBe("10K%");
    expect(formatCompactPercent(1_000_000)).toBe("1M%");
    expect(formatCompactPercent(1_000_000_000)).toBe("1B%");
  });
});

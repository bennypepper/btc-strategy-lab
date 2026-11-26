function formatWithCommas(absValue: number, fractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  }).format(absValue);
}

/**
 * Format a raw percentage value (e.g. 1500 for 1500%), matching core/utils.py:format_percentage.
 */
export function formatPercentage(value: number, decimalPlaces = 1): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  if (value === 0) {
    return decimalPlaces > 0 ? `0.${"0".repeat(decimalPlaces)}%` : "0%";
  }

  const sign = value > 0 ? "+" : "-";
  const absV = Math.abs(value);

  if (absV >= 1e12) {
    return `${sign}${(absV / 1e12).toFixed(2)}T%`;
  }
  if (absV >= 1e9) {
    return `${sign}${(absV / 1e9).toFixed(2)}B%`;
  }
  if (absV >= 1e6) {
    return `${sign}${(absV / 1e6).toFixed(2)}M%`;
  }
  if (absV >= 1e3) {
    return `${sign}${formatWithCommas(absV, 0)}%`;
  }
  return `${sign}${formatWithCommas(absV, decimalPlaces)}%`;
}

/**
 * Format a USD currency value by magnitude, matching core/utils.py:format_currency.
 */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }
  const sign = value < 0 ? "-" : "";
  const absV = Math.abs(value);

  if (absV >= 1e12) {
    return `${sign}$${(absV / 1e12).toFixed(2)}T`;
  }
  if (absV >= 1e9) {
    return `${sign}$${(absV / 1e9).toFixed(2)}B`;
  }
  if (absV >= 1e6) {
    return `${sign}$${(absV / 1e6).toFixed(2)}M`;
  }
  if (absV >= 1e3) {
    return `${sign}$${formatWithCommas(absV, 0)}`;
  }
  return `${sign}$${formatWithCommas(absV, 2)}`;
}

/**
 * Format a general numeric value (such as BTC quantities), matching core/utils.py:format_number.
 */
export function formatNumber(value: number, decimalPlaces = 6): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const sign = value < 0 ? "-" : "";
  const absV = Math.abs(value);

  if (absV >= 1e12) {
    return `${sign}${(absV / 1e12).toFixed(2)}T`;
  }
  if (absV >= 1e9) {
    return `${sign}${(absV / 1e9).toFixed(2)}B`;
  }
  if (absV >= 1e6) {
    return `${sign}${(absV / 1e6).toFixed(2)}M`;
  }
  if (absV >= 1e3) {
    return `${sign}${(absV / 1e3).toFixed(2)}K`;
  }
  if (Number.isInteger(absV)) {
    return `${sign}${Math.trunc(absV)}`;
  }
  return `${sign}${formatWithCommas(absV, decimalPlaces)}`
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function formatCompactMagnitude(absV: number): string {
  const trim = (scaled: number): string =>
    Number(scaled.toFixed(2))
      .toString();

  if (absV >= 1e12) return `${trim(absV / 1e12)}T`;
  if (absV >= 1e9) return `${trim(absV / 1e9)}B`;
  if (absV >= 1e6) return `${trim(absV / 1e6)}M`;
  if (absV >= 1e3) return `${trim(absV / 1e3)}K`;
  return trim(absV);
}

/**
 * Compact USD tick formatter for log-scale charts ($100, $1K, $10K, $1M, $1B, $1T).
 */
export function formatCompactDollar(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "$0";
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}$${formatCompactMagnitude(Math.abs(value))}`;
}

/**
 * Compact percentage tick formatter for log-scale return axes (1%, 100%, 10K%, 1M%).
 */
export function formatCompactPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "0%";
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}${formatCompactMagnitude(Math.abs(value))}%`;
}

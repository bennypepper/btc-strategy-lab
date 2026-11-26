type CsvCell = string | number | boolean | null | undefined;

const FORMULA_TRIGGER_RE = /^[=+\-@]/;

function serializeCell(value: CsvCell): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // Neutralize spreadsheet formula injection on string cells
  const safeStr = FORMULA_TRIGGER_RE.test(value) ? `'${value}` : value;

  if (
    safeStr.includes(",") ||
    safeStr.includes('"') ||
    safeStr.includes("\n") ||
    safeStr.includes("\r")
  ) {
    return `"${safeStr.replaceAll('"', '""')}"`;
  }
  return safeStr;
}

/**
 * Serialize an array of flat objects to RFC 4180 CSV with spreadsheet formula-injection protection.
 */
export function toCsv<T extends Record<string, CsvCell>>(
  rows: T[],
  columns?: (keyof T)[]
): string {
  const cols: (keyof T)[] =
    columns ?? (rows[0] ? (Object.keys(rows[0]) as (keyof T)[]) : []);
  if (cols.length === 0) {
    return "";
  }

  const lines: string[] = [cols.map((c) => serializeCell(String(c))).join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => serializeCell(row[c])).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Trigger a browser file download for text content (CSV / JSON).
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

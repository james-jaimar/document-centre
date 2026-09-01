/**
 * Helpers for spreadsheet-style pasting into pricing grids.
 *
 * Copy a column (or a block) from Excel / Google Sheets, click the first cell
 * and paste — each pasted line fills the next row down.
 */

/** Parse clipboard text into a 2D grid of trimmed strings (rows × tab columns). */
export function parseClipboardGrid(text: string): string[][] {
  const normalised = text.replace(/\r\n?/g, "\n");
  const lines = normalised.split("\n");
  // Drop trailing blank lines (Excel usually appends one).
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
}

/** True when the paste contains more than one cell (so it should fill a range). */
export function isMultiCellPaste(grid: string[][]): boolean {
  return grid.length > 1 || (grid.length === 1 && grid[0].length > 1);
}

/**
 * Clean a pasted numeric cell: strips currency symbols, spaces, thousands
 * separators and handles comma decimals. Returns null for blank/invalid.
 */
export function parseNumericCell(raw: string): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === "" || s === "-" || s === "—") return null;

  // Parentheses = negative in some exports.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Strip anything that is not a digit, separator or sign.
  s = s.replace(/[^\d.,\-]/g, "");
  if (s === "") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    // "1,750" → thousands; "1750,00" / "17,5" → decimal.
    s = decimals === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else {
    s = s.replace(/(?<=\d),(?=\d{3}\b)/g, "");
  }

  const value = Number.parseFloat(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

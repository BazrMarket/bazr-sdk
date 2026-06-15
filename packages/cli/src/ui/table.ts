/** Plain-text columns. Widths are computed from the uncoloured text. */

import { padLeft, padRight } from "./segments.js";
import type { Theme } from "./theme.js";

export interface Column<T> {
  header: string;
  align?: "left" | "right";
  value: (row: T) => string;
  paint?: (row: T, theme: Theme) => ((s: string) => string) | undefined;
  /** The column that gives up width first when the table is too wide. */
  flex?: boolean;
  minWidth?: number;
}

export function renderTable<T>(
  rows: readonly T[],
  columns: ReadonlyArray<Column<T>>,
  theme: Theme,
  maxWidth = 78,
): string[] {
  const gap = 2;
  const cells = rows.map((row) => columns.map((col) => col.value(row)));
  const widths = columns.map((col, i) =>
    Math.max(col.header.length, col.minWidth ?? 0, ...cells.map((r) => (r[i] ?? "").length)),
  );

  let total = widths.reduce((s, w) => s + w, 0) + gap * (columns.length - 1);
  if (total > maxWidth) {
    const flexIndex = columns.findIndex((c) => c.flex);
    if (flexIndex >= 0) {
      const over = total - maxWidth;
      const current = widths[flexIndex] ?? 0;
      widths[flexIndex] = Math.max(columns[flexIndex]?.minWidth ?? 8, current - over);
      total = widths.reduce((s, w) => s + w, 0) + gap * (columns.length - 1);
    }
  }

  const pad = (text: string, i: number): string => {
    const w = widths[i] ?? text.length;
    const clipped = text.length > w ? `${text.slice(0, Math.max(0, w - 3))}...` : text;
    return columns[i]?.align === "right" ? padLeft(clipped, w) : padRight(clipped, w);
  };

  const separator = " ".repeat(gap);
  const header = columns.map((col, i) => theme.dim(pad(col.header, i))).join(separator);
  const rule = theme.dim(widths.map((w) => "-".repeat(w)).join(separator));

  const body = rows.map((row, r) =>
    columns
      .map((col, i) => {
        const text = pad(cells[r]?.[i] ?? "", i);
        const paint = col.paint?.(row, theme);
        return paint ? paint(text) : text;
      })
      .join(separator),
  );

  return [header, rule, ...body];
}

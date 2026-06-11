/**
 * A price tag hanging off a stall, in ASCII.
 *
 *   +-[o]-- RELIC TAG ------------------------+
 *   | ...                                     |
 *   +-----------------------------------------+
 *
 * Pure ASCII on purpose: box-drawing characters and emoji both break on plain
 * consoles, and the output is meant to be pasteable anywhere.
 */

import { fit, render, seg, width } from "./segments.js";
import type { Seg } from "./segments.js";
import type { Theme } from "./theme.js";

export const MIN_WIDTH = 56;
export const MAX_WIDTH = 100;

export function resolveWidth(columns: number | undefined): number {
  if (!columns || !Number.isFinite(columns)) return 78;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(columns) - 1));
}

export class TagBox {
  private readonly lines: string[] = [];
  /** Usable characters between "| " and " |". */
  readonly inner: number;

  constructor(
    private readonly total: number,
    private readonly theme: Theme,
  ) {
    this.inner = total - 4;
  }

  /** Top edge with the tag's punch hole and an optional title. */
  top(title?: string): this {
    const head = title ? `+-[o]-- ${title} ` : "+-[o]";
    const fill = Math.max(0, this.total - head.length - 1);
    this.lines.push(this.theme.accent(`${head}${"-".repeat(fill)}+`));
    return this;
  }

  divider(): this {
    this.lines.push(this.theme.accent(`+${"-".repeat(this.total - 2)}+`));
    return this;
  }

  bottom(): this {
    this.lines.push(this.theme.accent(`+${"-".repeat(this.total - 2)}+`));
    return this;
  }

  row(segs: readonly Seg[]): this {
    const body = render(fit(segs, this.inner));
    const bar = this.theme.accent("|");
    this.lines.push(`${bar} ${body} ${bar}`);
    return this;
  }

  text(value: string, paint?: (s: string) => string): this {
    return this.row([seg(value, paint)]);
  }

  blank(): this {
    return this.row([]);
  }

  /** `LABEL   value` with the labels aligned in a column. */
  field(label: string, segs: readonly Seg[], labelWidth = 12): this {
    const padded = label.length >= labelWidth ? label : label + " ".repeat(labelWidth - label.length);
    return this.row([seg(padded, this.theme.dim), ...segs]);
  }

  /** Wraps long prose to the box width. */
  paragraph(value: string, paint?: (s: string) => string): this {
    for (const line of wrap(value, this.inner)) this.text(line, paint);
    return this;
  }

  toLines(): string[] {
    return [...this.lines];
  }
}

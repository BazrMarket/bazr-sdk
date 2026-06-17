import type { BazrClient } from "@bazr/sdk";
import { wrap } from "./ui/box.js";
import type { Theme } from "./ui/theme.js";

export type Writer = (line: string) => void;

export interface CliContext {
  out: Writer;
  err: Writer;
  theme: Theme;
  /** Total render width in characters. */
  width: number;
  json: boolean;
  client: BazrClient;
  baseUrl: string;
  debug: boolean;
}

export function printLines(ctx: CliContext, lines: readonly string[]): void {
  for (const line of lines) ctx.out(line);
}

export function printJson(ctx: CliContext, value: unknown): void {
  ctx.out(JSON.stringify(value, null, 2));
}

/** An indented, wrapped footnote. Nothing the CLI prints runs off the width. */
export function note(ctx: CliContext, text: string, indent = 6): void {
  const paint = ctx.theme.dim;
  for (const line of wrap(text, Math.max(20, ctx.width - indent))) {
    ctx.out(paint(" ".repeat(indent) + line));
  }
}

/** Same as {@link note} but painted as a warning. */
export function warnNote(ctx: CliContext, text: string, indent = 6): void {
  for (const line of wrap(text, Math.max(20, ctx.width - indent))) {
    ctx.out(ctx.theme.warn(" ".repeat(indent) + line));
  }
}

/**
 * The disclaimer travels with every response and is printed every time.
 * It is the difference between "these are survival signals" and a price call.
 */
export function printDisclaimer(ctx: CliContext, disclaimer: string): void {
  ctx.out("");
  ctx.out(ctx.theme.dim(`NOTE  ${disclaimer}`));
}

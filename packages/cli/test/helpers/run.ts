import { runCli } from "../../src/cli.js";

export interface CliResult {
  code: number;
  stdout: string[];
  stderr: string[];
  out: string;
  err: string;
  all: string;
  /** Whole output with runs of whitespace collapsed, for phrases that may wrap. */
  flat: string;
}

export async function run(
  argv: string[],
  extra: {
    env?: Record<string, string | undefined>;
    isTTY?: boolean;
    columns?: number;
  } = {},
): Promise<CliResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli({
    argv,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    env: extra.env ?? {},
    isTTY: extra.isTTY ?? false,
    columns: extra.columns ?? 80,
  });
  const all = [...stdout, ...stderr].join("\n");
  return {
    code,
    stdout,
    stderr,
    out: stdout.join("\n"),
    err: stderr.join("\n"),
    all,
    flat: stripAnsi(all).replace(/\s+/g, " ").trim(),
  };
}

/** Emoji and glyph status markers are banned everywhere in the output. */
export const EMOJI_RE = new RegExp(
  "\\p{Extended_Pictographic}|[\\u2190-\\u21FF\\u2300-\\u23FF\\u2600-\\u27BF\\u2713\\u2714\\u2716\\u2717\\u2718\\uFE0F\\u2B00-\\u2BFF]",
  "u",
);

/**
 * bazr-honesty-allow-file: this file spells out the banned marketing terms on
 * purpose, the same way CONTRIBUTING.md does. A scan that counted a denylist as
 * a violation would make writing the denylist a punishment.
 *
 * Marketing language the relic specification forbids in section 0, restated in
 * CONTRIBUTING.md under "Language and claims". A relic score is an
 * observational summary, so no rendered line may promise a price outcome.
 *
 * This asserts on the CLI's runtime output, which is the surface a user
 * actually reads. It is not a source scan and is not a substitute for review.
 */
export const BANNED_RE =
  /\b(guaranteed|100x|1000x|moonshot|moon|hidden gem|gem|next pump|pump signal|buy signal|alpha call|revival probability|will recover|sure thing)\b/i;

const ESC = String.fromCharCode(27);

/** Counts ANSI colour sequences without embedding a control character in source. */
export function ansiCount(text: string): number {
  return (text.match(new RegExp(`${ESC}\\[`, "g")) ?? []).length;
}

/** Strips ANSI colour so widths can be measured. */
export function stripAnsi(text: string): string {
  return text.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "");
}

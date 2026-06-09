/**
 * Colour is decoration, never information.
 *
 * Everything the CLI prints must still read correctly with colour stripped:
 * no emoji, no check marks, no glyph-only status. Status is spelled out as
 * words or as `O` / `X`.
 */

import { createColors } from "picocolors";

export interface Theme {
  enabled: boolean;
  heading: (s: string) => string;
  dim: (s: string) => string;
  good: (s: string) => string;
  warn: (s: string) => string;
  bad: (s: string) => string;
  accent: (s: string) => string;
  bold: (s: string) => string;
}

export interface ThemeInput {
  isTTY: boolean;
  env: Record<string, string | undefined>;
  /** --color / --no-color, when given. */
  force?: boolean | undefined;
}

export function resolveColorEnabled({ isTTY, env, force }: ThemeInput): boolean {
  if (force !== undefined) return force;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "" && env.FORCE_COLOR !== "0") return true;
  if (env.TERM === "dumb") return false;
  return isTTY;
}

export function createTheme(input: ThemeInput): Theme {
  const enabled = resolveColorEnabled(input);
  const c = createColors(enabled);
  return {
    enabled,
    heading: (s) => c.bold(c.cyan(s)),
    dim: (s) => c.gray(s),
    good: (s) => c.green(s),
    warn: (s) => c.yellow(s),
    bad: (s) => c.red(s),
    accent: (s) => c.blue(s),
    bold: (s) => c.bold(s),
  };
}

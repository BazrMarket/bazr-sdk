import { DEFAULT_BASE_URL, createBazrClient, describeError, errorHints } from "@bazr/sdk";
import type { BazrClient, RetryInfo, StallSort } from "@bazr/sdk";
import { UsageError, flagBool, flagNumber, flagString, parseArgs } from "./args.js";
import type { FlagType } from "./args.js";
import { HELP } from "./help.js";
import { createTheme } from "./ui/theme.js";
import type { Theme } from "./ui/theme.js";
import type { CliContext, Writer } from "./context.js";
import { note, printJson } from "./context.js";
import { relicCommand } from "./commands/relic.js";
import { tagsCommand } from "./commands/tags.js";
import { stallCommand, stallsCommand } from "./commands/stalls.js";
import { crateListCommand, crateShowCommand } from "./commands/crate.js";
import { haggleCommand } from "./commands/haggle.js";
import { formatCount, formatUsd } from "./ui/format.js";
import { resolveWidth } from "./ui/box.js";

declare const __CLI_VERSION__: string;
export const CLI_VERSION: string =
  typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.1.0";

const FLAG_SPEC: Record<string, FlagType> = {
  api: "string",
  json: "boolean",
  color: "boolean",
  "no-color": "boolean",
  timeout: "number",
  retries: "number",
  debug: "boolean",
  help: "boolean",
  version: "boolean",
  refresh: "boolean",
  sort: "string",
  limit: "number",
  cursor: "string",
  in: "string",
  out: "string",
  amount: "string",
  "slippage-bps": "number",
};

const STALL_SORTS: readonly StallSort[] = ["record", "recent", "listings"];

/**
 * Per-attempt timeout, picked per endpoint rather than one blanket number.
 *
 * One 10s default meant `bazr relic` timed out on every cache miss, then spent
 * its remaining attempts timing out again -- the command could not succeed
 * against a mint nobody had scored yet. Scoring gets room to answer. The cheap
 * endpoints keep the short timeout, so an unreachable host is reported in
 * seconds instead of holding the terminal for minutes.
 */
const DEFAULT_TIMEOUT_MS = 10_000;
const SCORING_TIMEOUT_MS = 90_000;
const SCORING_COMMANDS: ReadonlySet<string> = new Set(["relic", "tags"]);

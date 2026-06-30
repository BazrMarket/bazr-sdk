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

function defaultTimeoutMs(command: string | undefined): number {
  return command !== undefined && SCORING_COMMANDS.has(command)
    ? SCORING_TIMEOUT_MS
    : DEFAULT_TIMEOUT_MS;
}

/** How long the API may stay silent before the CLI says it is still waiting. */
const QUIET_BEFORE_NOTICE_MS = 5_000;

function formatDelay(ms: number): string {
  return ms >= 1_000 ? `${Math.round(ms / 100) / 10}s` : `${Math.round(ms)}ms`;
}

/**
 * Scoring a cold mint takes tens of seconds. Printing nothing for that long is
 * indistinguishable from being hung -- which is precisely how a silent failure
 * in the retry path went unnoticed. Progress goes to stderr, so `--json` on
 * stdout stays machine-readable.
 */
function startWaitNotice(
  stderr: Writer,
  theme: Theme,
  command: string,
  timeoutMs: number,
): () => void {
  if (timeoutMs <= QUIET_BEFORE_NOTICE_MS) return () => undefined;
  const timer = setTimeout(() => {
    stderr(
      theme.dim(
        `   still waiting on the API -- "${command}" allows ` +
          `${Math.round(timeoutMs / 1000)}s per attempt`,
      ),
    );
  }, QUIET_BEFORE_NOTICE_MS);
  return () => clearTimeout(timer);
}

/**
 * Retries were invisible: the CLI sat quiet for the length of every attempt
 * and then printed one error at the end. Announcing each wait is what tells a
 * slow run apart from a stuck one.
 */
function retryNotice(stderr: Writer, theme: Theme): (info: RetryInfo) => void {
  return (info) =>
    stderr(
      theme.dim(
        `   attempt ${info.attempt} failed (${info.reason});` +
          ` retrying in ${formatDelay(info.delayMs)}`,
      ),
    );
}

export interface RunCliOptions {
  argv: readonly string[];
  stdout: Writer;
  stderr: Writer;
  env?: Record<string, string | undefined>;
  isTTY?: boolean;
  columns?: number;
  /** Injectable so tests can drive the CLI without touching the network layer. */
  createClient?: (baseUrl: string, opts: { timeoutMs: number; retries: number }) => BazrClient;
}

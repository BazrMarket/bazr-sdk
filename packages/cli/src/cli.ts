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
 * Measured against the production service on 2026-08-18 with a cold cache:
 *
 *   GET /health                  0.4s
 *   GET /stall                   0.4s
 *   GET /relic/{mint}           28.8s   holder page walk, pool discovery, upstreams
 *   GET /relic/{mint}/tags      47.7s
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

export async function runCli(options: RunCliOptions): Promise<number> {
  const { stdout, stderr } = options;
  const env = options.env ?? {};

  let parsed;
  try {
    parsed = parseArgs(options.argv, FLAG_SPEC);
  } catch (err) {
    return usageFailure(stderr, err instanceof Error ? err.message : String(err));
  }

  const { positionals, flags } = parsed;
  const colorForce = flagBool(flags, "no-color")
    ? false
    : flagBool(flags, "color")
      ? true
      : undefined;
  const theme = createTheme({ isTTY: options.isTTY ?? false, env, force: colorForce });

  if (flagBool(flags, "version")) {
    stdout(CLI_VERSION);
    return 0;
  }
  if (flagBool(flags, "help") || positionals.length === 0) {
    stdout(HELP);
    return positionals.length === 0 && !flagBool(flags, "help") ? 2 : 0;
  }

  const [command, ...rest] = positionals;

  const baseUrl = flagString(flags, "api") ?? env.BAZR_API ?? DEFAULT_BASE_URL;
  const timeoutMs = flagNumber(flags, "timeout") ?? defaultTimeoutMs(command);
  const retries = flagNumber(flags, "retries") ?? 3;

  let client: BazrClient;
  try {
    client = options.createClient
      ? options.createClient(baseUrl, { timeoutMs, retries })
      : createBazrClient({
          baseUrl,
          timeoutMs,
          retry: {
            maxAttempts: Math.max(1, Math.round(retries)),
            onRetry: retryNotice(stderr, theme),
          },
          userAgent: `bazr-cli/${CLI_VERSION}`,
        });
  } catch (err) {
    return failure(stderr, theme, err, flagBool(flags, "debug"));
  }

  const ctx: CliContext = {
    out: stdout,
    err: stderr,
    theme,
    width: resolveWidth(options.columns),
    json: flagBool(flags, "json"),
    client,
    baseUrl,
    debug: flagBool(flags, "debug"),
  };

  const stopWaitNotice = startWaitNotice(stderr, theme, command ?? "", timeoutMs);

  try {
    switch (command) {
      case "relic": {
        const mint = requireArg(rest[0], "bazr relic <mint>");
        return await relicCommand(ctx, mint, { refresh: flagBool(flags, "refresh") });
      }
      case "tags": {
        const mint = requireArg(rest[0], "bazr tags <mint>");
        return await tagsCommand(ctx, mint);
      }
      case "stalls": {
        const sort = flagString(flags, "sort");
        if (sort !== undefined && !STALL_SORTS.includes(sort as StallSort)) {
          throw new UsageError(`--sort must be one of ${STALL_SORTS.join(", ")} (got "${sort}")`);
        }
        return await stallsCommand(ctx, {
          sort: sort as StallSort | undefined,
          limit: flagNumber(flags, "limit"),
          cursor: flagString(flags, "cursor"),
        });
      }
      case "stall": {
        const owner = requireArg(rest[0], "bazr stall <owner>");
        return await stallCommand(ctx, owner);
      }
      case "crate": {
        const sub = rest[0];
        if (sub === "list" || sub === undefined) {
          return await crateListCommand(ctx, {
            limit: flagNumber(flags, "limit"),
            cursor: flagString(flags, "cursor"),
          });
        }
        if (sub === "show") {
          const id = requireArg(rest[1], "bazr crate show <id>");
          return await crateShowCommand(ctx, id);
        }
        throw new UsageError(`Unknown crate subcommand "${sub}". Try: bazr crate list`);
      }
      case "haggle": {
        const inputMint = requireFlag(flagString(flags, "in"), "--in <mint>");
        const outputMint = requireFlag(flagString(flags, "out"), "--out <mint>");
        const amount = requireFlag(flagString(flags, "amount"), "--amount <raw base units>");
        if (!/^\d+$/.test(amount)) {
          throw new UsageError(`--amount must be a whole number of base units (got "${amount}")`);
        }
        return await haggleCommand(ctx, {
          inputMint,
          outputMint,
          amount,
          slippageBps: flagNumber(flags, "slippage-bps"),
        });
      }
      case "stats":
        return await statsCommand(ctx);
      case "health":
        return await healthCommand(ctx);
      case "help":
        stdout(HELP);
        return 0;
      default:
        throw new UsageError(`Unknown command "${command}"`);
    }
  } catch (err) {
    if (err instanceof UsageError) return usageFailure(stderr, err.message);
    return failure(stderr, theme, err, ctx.debug);
  } finally {
    // Must run on every path. A stray pending timer would otherwise keep the
    // process alive past the last line of output.
    stopWaitNotice();
  }
}

async function statsCommand(ctx: CliContext): Promise<number> {
  const stats = await ctx.client.getStats();
  if (ctx.json) {
    printJson(ctx, stats);
    return 0;
  }
  const { theme } = ctx;
  ctx.out(theme.heading("MARKET"));
  ctx.out(`      relics scored        ${formatCount(stats.relics_scored)}`);
  ctx.out(`      stalls open          ${formatCount(stats.stalls)}`);
  ctx.out(`      crates live          ${formatCount(stats.crates_live)}`);
  ctx.out(`      aftermarket volume   ${formatUsd(stats.aftermarket_volume_usd)}`);
  ctx.out(`      data cluster         ${stats.data_cluster ?? "unknown"}`);
  /*
    Two chains, printed as two lines, never merged into one "cluster". The
    scoring RPC reads mainnet because that is where graduated memes live; the
    program is deployed somewhere else entirely.

    The line is dropped outright when nothing is deployed, rather than falling
    back to "unknown" the way the fields above do. Those fields exist and are
    merely unread; this one is absent from the response because there is no
    deployment to name, and calling that "unknown" would file "not deployed"
    and "we did not get a value" under the same word.
  */
  if (stats.program_cluster) {
    ctx.out(`      program cluster      ${stats.program_cluster}`);
    // The Anchor version describes a deployment, so it goes where the
    // deployment goes. Printed on its own it implies a program is out there.
    ctx.out(`      anchor               ${stats.anchor_version ?? "unknown"}`);
  }
  ctx.out("");
  note(ctx, "Counters the service actually holds. Missing values print as --.");
  return 0;
}

async function healthCommand(ctx: CliContext): Promise<number> {
  const health = await ctx.client.getHealth();
  if (ctx.json) {
    printJson(ctx, health);
    return 0;
  }
  const ok = health.status.toLowerCase() === "ok";
  ctx.out(`${ok ? ctx.theme.good("PASS") : ctx.theme.bad("FAIL")}  ${ctx.baseUrl}`);
  ctx.out(ctx.theme.dim(`      status ${health.status}, version ${health.version ?? "unknown"}`));
  return ok ? 0 : 1;
}

function requireArg(value: string | undefined, usage: string): string {
  if (value === undefined || value.trim() === "") throw new UsageError(`Missing argument: ${usage}`);
  return value;
}

function requireFlag(value: string | undefined, usage: string): string {
  if (value === undefined || value.trim() === "") throw new UsageError(`Missing option: ${usage}`);
  return value;
}

function usageFailure(stderr: Writer, message: string): number {
  stderr(`X  ${message}`);
  stderr('   Run "bazr --help" for usage.');
  return 2;
}

/**
 * A dead backend must produce a sentence, not a stack trace. The stack is
 * available behind --debug for whoever actually wants it.
 */
function failure(
  stderr: Writer,
  theme: { bad: (s: string) => string; dim: (s: string) => string },
  err: unknown,
  debug: boolean,
): number {
  stderr(theme.bad(`X  ${describeError(err)}`));
  for (const hint of errorHints(err)) stderr(theme.dim(`   ${hint}`));
  if (debug && err instanceof Error && err.stack) stderr(theme.dim(err.stack));
  else if (!debug) stderr(theme.dim("   Run again with --debug for the stack trace."));
  return 1;
}

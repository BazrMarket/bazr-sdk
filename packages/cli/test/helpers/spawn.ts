/**
 * Runs the built binary as a real child process.
 *
 * `run()` in ./run.ts calls `runCli` inside the test runner, which is the
 * right tool for rendering and argument handling. It cannot see whether the
 * process finishes -- vitest keeps the event loop busy on its own, so a
 * command that would strand a bare `node dist/bazr.js` still returns here.
 * Anything about *terminating* has to be measured out here instead.
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The artefact `package.json#bin` points at -- the file a user actually runs. */
export const BAZR_BIN = join(PKG_ROOT, "dist", "bazr.js");

/** Node's status for an ESM entry whose top-level await never settled. */
export const EXIT_UNSETTLED_TLA = 13;

/** bazr's own status for "stopped before producing a result". */
export const EXIT_INTERNAL = 70;

export const UNSETTLED_WARNING = "unsettled top-level await";

/**
 * Node's own exit status for a top-level await that never settled. It is
 * reported on every supported version, including the ones that print no
 * warning text at all, which is why it is asserted alongside the message
 * rather than instead of it.
 */
export const EXIT_UNSETTLED_AWAIT = 13;

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  all: string;
  /** Whole output, ANSI stripped and whitespace collapsed, for wrapped phrases. */
  flat: string;
  /** True when the child had to be killed because it never exited on its own. */
  killed: boolean;
  durationMs: number;
}

export interface SpawnOptions {
  env?: Record<string, string | undefined>;
  /** Hard ceiling. A genuinely hung command must fail a test, not hang the suite. */
  timeoutMs?: number;
}

const ESC = String.fromCharCode(27);

function stripAnsi(text: string): string {
  return text.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "");
}

export async function spawnBazr(
  args: readonly string[],
  opts: SpawnOptions = {},
): Promise<SpawnResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000;

  // A clean environment: an ambient BAZR_API or FORCE_COLOR on the developer's
  // machine must not decide what the assertions see.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...opts.env })) {
    if (value !== undefined) env[key] = value;
  }
  for (const key of ["BAZR_API", "FORCE_COLOR", "NO_COLOR"]) {
    if (opts.env && key in opts.env && opts.env[key] === undefined) delete env[key];
  }

  const started = Date.now();
  const child = spawn(process.execPath, [BAZR_BIN, ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  let killed = false;
  const killer = setTimeout(() => {
    killed = true;
    child.kill("SIGKILL");
  }, timeoutMs);

  const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) => {
    child.on("close", (c, s) => resolve([c, s]));
  });
  clearTimeout(killer);

  const all = stdout + stderr;
  return {
    code,
    signal,
    stdout,
    stderr,
    all,
    flat: stripAnsi(all).replace(/\s+/g, " ").trim(),
    killed,
    durationMs: Date.now() - started,
  };
}

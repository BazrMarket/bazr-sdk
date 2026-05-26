/**
 * Builds `dist/` before the tests run.
 *
 * sleep.test.ts has to load the SDK from a separate Node process -- the thing
 * it measures is whether the process stays alive, which is meaningless inside
 * a test runner that is holding the event loop open anyway. A child process
 * can only import the built entry point, so the build has to have happened.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function setup(): Promise<void> {
  const tsup = join(PKG_ROOT, "node_modules", "tsup", "dist", "cli-default.js");
  if (!existsSync(tsup)) {
    throw new Error(`Cannot build @bazr/sdk: ${tsup} is missing. Run "npm install" first.`);
  }
  execFileSync(process.execPath, [tsup], { cwd: PKG_ROOT, stdio: "pipe" });

  const entry = join(PKG_ROOT, "dist", "index.js");
  if (!existsSync(entry)) throw new Error(`Build produced no ${entry}`);
}

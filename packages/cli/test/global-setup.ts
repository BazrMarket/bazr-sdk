/**
 * Builds the artefacts the spawned-process tests run against.
 *
 * Those tests exist because one whole class of bug is invisible from inside
 * the test runner. `runCli` called in-process always finishes: vitest has its
 * own timers, sockets and file watchers pending, so the event loop never
 * empties and even a timer that was explicitly excused from holding the
 * process open still fires. In a bare `node dist/bazr.js`, with nothing else
 * queued, the same timer lets Node walk away mid-command.
 *
 * That is not a hypothetical -- it shipped, and every existing test passed
 * while `bazr relic` produced no output at all against the real service. So
 * the suite has to run the binary the way a user runs it, which means the
 * bundle must exist and be current before the tests start.
 *
 * The SDK is built too when it is linked from the sibling package. Testing the
 * shipped binary against a stale `@bazr/sdk/dist` would be the same failure in
 * a new costume: green output that measured the wrong thing.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SDK_ROOT = join(PKG_ROOT, "..", "sdk-ts");

function build(root: string, label: string): void {
  const tsup = join(root, "node_modules", "tsup", "dist", "cli-default.js");
  if (!existsSync(tsup)) {
    throw new Error(
      `Cannot build ${label}: ${tsup} is missing. Run "npm install" in ${root} first.`,
    );
  }
  execFileSync(process.execPath, [tsup], { cwd: root, stdio: "pipe" });
}

export async function setup(): Promise<void> {
  // Linked for development; a registry install has no sibling source to build.
  if (existsSync(join(SDK_ROOT, "package.json"))) build(SDK_ROOT, "@bazr/sdk");
  build(PKG_ROOT, "bazr-cli");

  const bin = join(PKG_ROOT, "dist", "bazr.js");
  if (!existsSync(bin)) throw new Error(`Build produced no ${bin}`);
}

/**
 * `defaultSleep` has to keep the process alive until it settles.
 *
 * This looks like it does not need a test, and that is exactly why the bug
 * shipped. The retry loop awaits this promise; an earlier version created the
 * timer and then called `unref()` on it so a pending backoff "would not hold
 * the process open". By the time the loop reaches a backoff the failed request
 * has already released its socket, so an unref'd timer leaves Node with no
 * work at all: it exits, and the await never settles. Everything downstream --
 * the rest of the retry loop, the caller's `await`, whatever the caller meant
 * to print -- is simply abandoned, with no error and no failing status.
 *
 * Nothing in the rest of this suite could catch it. Every other retry test
 * injects `recordingSleep`, and the two that do not run inside vitest, whose
 * own handles keep the loop busy so the unref'd timer fires regardless. The
 * only place the difference is observable is a Node process with nothing else
 * to do, so that is what these tests measure.
 */

import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { defaultSleep } from "../src/index.js";

const execFileAsync = promisify(execFile);

const DIST_ENTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
const ENTRY_URL = new URL(`file://${DIST_ENTRY}`).href;

interface BareRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs one ESM snippet in a Node process that has nothing else pending. */
async function bareNode(source: string): Promise<BareRun> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--input-type=module", "-e", source],
      { timeout: 20_000 },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("defaultSleep in a process with nothing else to do", () => {
  it("settles, so an awaiting caller gets to run its next line", async () => {
    const r = await bareNode(`
      import { defaultSleep } from ${JSON.stringify(ENTRY_URL)};
      await defaultSleep(200);
      process.stdout.write("settled");
    `);

    expect(r.stdout).toBe("settled");
    expect(r.code).toBe(0);
    // Node's complaint when the entry module's await is abandoned. Its absence
    // is the whole assertion: the process finished the work it was given.
    expect(r.stderr).not.toContain("unsettled top-level await");
  });

  it("does not let the process leave before the wait is over", async () => {
    // A backoff inside a retry loop, with the request already gone: exactly the
    // shape the CLI hit. The line after the sleep must still be reached.
    const r = await bareNode(`
      import { defaultSleep } from ${JSON.stringify(ENTRY_URL)};
      let reached = false;
      process.on("exit", () => {
        if (!reached) process.stdout.write("ABANDONED");
      });
      await defaultSleep(300);
      reached = true;
      process.stdout.write("reached");
    `);

    expect(r.stdout).toBe("reached");
    expect(r.stdout).not.toContain("ABANDONED");
    expect(r.code).toBe(0);
  });

  it("is what an unref'd timer would have failed -- control group", async () => {
    // The previous implementation, inline. If this passed, the assertions
    // above would prove nothing about the fix.
    const r = await bareNode(`
      const sleep = (ms) => new Promise((resolve) => {
        const t = setTimeout(resolve, ms);
        t.unref();
      });
      await sleep(300);
      process.stdout.write("settled");
    `);

    // The claim is about behaviour, so it is asserted as behaviour: the write
    // after the await never ran, and the process reported the abandonment in
    // its status. Both hold on every Node that supports top-level await.
    expect(r.stdout).toBe("");
    expect(r.code).not.toBe(0);

    // The human-readable diagnostic is a runtime courtesy, not a contract.
    // Newer Node prints "Detected unsettled top-level await"; Node 20 exits
    // with the same non-zero status and says nothing at all. Asserting the
    // sentence made this control group pass on the developer's machine and
    // fail on CI, which is the failure mode a control group exists to prevent:
    // it was measuring the runtime's wording rather than the bug. So it is
    // checked only where the runtime chose to provide it.
    if (r.stderr.trim() !== "") {
      expect(r.stderr).toContain("unsettled top-level await");
    }
  });

  it("still waits the time it was asked for", async () => {
    const started = Date.now();
    await defaultSleep(120);
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it("resolves immediately enough for a zero-length backoff", async () => {
    const started = Date.now();
    await defaultSleep(0);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

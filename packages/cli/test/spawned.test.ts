/**
 * The binary, run the way a user runs it.
 *
 * Everything in cli.test.ts calls `runCli` inside the test runner, and all of
 * it passed while `bazr relic <mint>` against the production service printed
 * nothing at all and exited without saying it had failed. The reason those
 * tests could not see it: an in-process call has vitest's own event loop under
 * it, so a backoff timer that had been excused from holding the process open
 * fired anyway. In a bare `node dist/bazr.js` nothing else was pending, Node
 * drained the loop mid-backoff, and the awaited sleep never settled.
 *
 * So these tests assert the two things only a real process can show:
 *
 *   1. the command reaches its output through the retry path, and
 *   2. it terminates, with a status that matches what happened.
 *
 * Every case here drives a real HTTP round trip against a mock server and
 * lets the SDK's own backoff run -- no injected sleep. Substituting one would
 * remove the only moving part that was broken.
 */

import { afterEach, describe, expect, it } from "vitest";
import { findClosedPort, startMockServer } from "./helpers/server.js";
import type { MockServer } from "./helpers/server.js";
import { RELIC_MINT, relicPayload, stallListPayload } from "./helpers/fixtures.js";
import { EXIT_INTERNAL, EXIT_UNSETTLED_AWAIT, UNSETTLED_WARNING, spawnBazr } from "./helpers/spawn.js";
import type { SpawnResult } from "./helpers/spawn.js";

let server: MockServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

/**
 * The invariant behind the whole file: whatever else a run does, it must end
 * on its own and it must never end by quietly evaporating.
 */
function expectFinished(r: SpawnResult): void {
  expect(r.killed).toBe(false);
  expect(r.signal).toBe(null);
  expect(r.all).not.toContain(UNSETTLED_WARNING);
  // The warning above is a runtime courtesy that not every supported Node
  // prints -- Node 20 abandons a top-level await silently. On that runtime the
  // line above is satisfied by an empty string and proves nothing, so the
  // status is checked too: 13 is Node's own code for an abandoned top-level
  // await, and it is reported on every version. Without this the check would
  // be strongest exactly where it is least needed.
  expect(r.code).not.toBe(EXIT_UNSETTLED_AWAIT);
  expect(r.code).not.toBe(EXIT_INTERNAL);
}

const AXIS_LABELS = [
  "Holder dispersion",
  "LP residual",
  "Dev wallet state",
  "Floor shape",
  "Social afterglow",
];

/*
  Not every retry reproduces the failure, and the difference matters enough to
  write down.

  What kills the process is an *empty* event loop during the backoff. After a
  timeout the request is aborted and its socket destroyed, so nothing is left
  pending and Node walks away mid-wait. After an HTTP response -- 503, 429,
  with or without `Connection: close` -- undici still has the connection in
  hand, that counts as work, and the loop survives the backoff regardless.

  Measured, not assumed: with the broken sleep restored, the two timeout cases
  below fail and every 5xx/429 case in this block passes. So a suite built from
  the tidy 5xx retry alone would have read as regression coverage and caught
  nothing at all. The timeout cases are the ones with teeth; the others are
  here for the retry policy, not for this bug. Do not drop the timeout cases on
  the grounds that a retry is already covered.
*/
describe("bazr relic survives the retry path as a real process", () => {
  it("a 503 on the first attempt is retried and the breakdown still prints", async () => {
    // The backoff between these two calls is where the process used to die.
    server = await startMockServer((_req, i) =>
      i === 0
        ? { status: 503, body: { error: { code: "upstream", message: "scoring backend busy" } } }
        : { body: relicPayload() },
    );

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(0);
    expect(server.requests).toHaveLength(2);
    expect(r.stdout).toContain("AXIS BREAKDOWN");
    for (const label of AXIS_LABELS) expect(r.stdout).toContain(label);
    // An exit status of 0 with an empty stdout is the failure being guarded
    // against; assert the output exists, not just the status.
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  });

  it("a 503 that closes the connection is retried and the breakdown still prints", async () => {
    // Covers the retry policy against a server that refuses keep-alive. Worth
    // stating plainly: this one still passed against the broken sleep, so it
    // is coverage of the policy, not of the hang.
    server = await startMockServer((_req, i) =>
      i === 0
        ? { status: 503, headers: { connection: "close" }, body: {} }
        : { body: relicPayload() },
    );

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(0);
    expect(server.requests).toHaveLength(2);
    expect(r.stdout).toContain("AXIS BREAKDOWN");
  });

  it("a first-attempt timeout is retried and the breakdown still prints", async () => {
    // The closest reproduction of the production failure: the relic endpoint
    // outran the per-attempt timeout on a cold cache, every time.
    server = await startMockServer((_req, i) =>
      i === 0 ? { body: relicPayload(), delayMs: 2_000 } : { body: relicPayload() },
    );

    const r = await spawnBazr([
      "relic",
      RELIC_MINT,
      "--api",
      server.baseUrl,
      "--timeout",
      "300",
    ]);

    expectFinished(r);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("AXIS BREAKDOWN");
    // The wait is announced rather than spent in silence.
    expect(r.stderr).toContain("attempt 1 failed (timeout)");
  });

  it("a 429 with Retry-After is waited out and the breakdown still prints", async () => {
    server = await startMockServer((_req, i) =>
      i === 0
        ? { status: 429, headers: { "retry-after": "1" }, body: { error: { message: "slow down" } } }
        : { body: relicPayload() },
    );

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("AXIS BREAKDOWN");
    // A full second of backoff actually elapsed rather than being skipped.
    expect(r.durationMs).toBeGreaterThanOrEqual(1_000);
  });

  it("two failed attempts still reach the third and print", async () => {
    server = await startMockServer((_req, i) =>
      i < 2 ? { status: 502, body: {} } : { body: relicPayload() },
    );

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(0);
    expect(server.requests).toHaveLength(3);
    expect(r.stdout).toContain("AXIS BREAKDOWN");
  });
});

describe("what the relic tag prints, from the shipped binary", () => {
  it("prints unknown axes as -- and no data, never as 0", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(0);
    // The fixture leaves dev_wallet_state and social_afterglow unobservable.
    expect(r.flat).toContain("Dev wallet state -- 15% excluded no data");
    expect(r.flat).toContain("Social afterglow -- 10% excluded no data");
    expect(r.flat).toContain("2 of 5 axes could not be observed");
    expect(r.flat).toContain("not counted as zero");
  });

  it("prints the disclaimer that travelled with the response", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.stdout).toContain("Survival-signal summary, not a prediction of price or revival.");
  });

  it("shows the contribution sum next to the score the API reported", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.flat).toContain("Contributions sum to 46.9; the API reported 47");
  });

  it("--json puts the validated response on stdout and nothing else", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl, "--json"]);

    expectFinished(r);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { mint: string; axes: unknown[] };
    expect(parsed.mint).toBe(RELIC_MINT);
    expect(parsed.axes).toHaveLength(5);
  });
});

describe("bazr stalls, from the shipped binary", () => {
  it("prints wins and losses side by side with no win rate anywhere", async () => {
    server = await startMockServer(() => ({ body: stallListPayload() }));

    const r = await spawnBazr(["stalls", "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(0);

    const header = r.stdout.split("\n").find((line) => line.includes("WINS"));
    expect(header).toBeDefined();
    expect(header).toContain("LOSSES");
    // Same column treatment: neither count is given more room than the other.
    expect((header as string).indexOf("WINS")).toBeLessThan((header as string).indexOf("LOSSES"));
    expect(r.flat).toContain("totals: 10 wins, 16 losses, 4 pending");
    expect(r.flat).toMatch(/win-rate column is derived/i);
    expect(r.stdout).not.toMatch(/win[ _-]?rate\s*[:=]/i);
    expect(r.stdout).not.toMatch(/\bWIN%|\bWINRATE\b/i);
  });
});

describe("failures end the process with a status that says so", () => {
  it("a refused connection exits 1 with a sentence and no stack trace", async () => {
    const port = await findClosedPort();

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", `http://127.0.0.1:${port}`]);

    expectFinished(r);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("X  Cannot reach");
    expect(r.stderr).toContain("Is the BAZR service running and reachable?");
    expect(r.stderr).not.toContain("at Object.");
    expect(r.stdout.trim()).toBe("");
  });

  it("a request that never answers in time exits 1 rather than vanishing", async () => {
    // Every attempt times out. Before the fix this was the silent-success
    // path: no output, and a status no script would read as a failure.
    server = await startMockServer(() => ({ body: relicPayload(), delayMs: 3_000 }));

    const r = await spawnBazr([
      "relic",
      RELIC_MINT,
      "--api",
      server.baseUrl,
      "--timeout",
      "200",
      "--retries",
      "2",
    ]);

    expectFinished(r);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("X  No response from");
    expect(r.stdout.trim()).toBe("");
  });

  it("an exhausted rate limit exits 1 and points at --refresh", async () => {
    server = await startMockServer(() => ({
      status: 429,
      body: { error: { code: "rate_limited", message: "too many requests" } },
    }));

    const r = await spawnBazr([
      "relic",
      RELIC_MINT,
      "--api",
      server.baseUrl,
      "--retries",
      "1",
    ]);

    expectFinished(r);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Rate limited by the BAZR API (429)");
    expect(r.stderr).toContain("--refresh");
  });

  it("a payload that breaks the contract exits 1 and says which field", async () => {
    server = await startMockServer(() => ({
      body: relicPayload({ verdict: "moonshot" }),
    }));

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("did not match the expected contract");
    expect(r.stderr).toContain("verdict");
  });

  it("health against a service reporting anything but ok exits 1", async () => {
    server = await startMockServer(() => ({
      body: { status: "degraded", version: "0.1.0", uptime_s: 12 },
    }));

    const r = await spawnBazr(["health", "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("FAIL");
  });

  it("health against a healthy service exits 0", async () => {
    server = await startMockServer(() => ({
      body: { status: "ok", version: "0.1.0", uptime_s: 12 },
    }));

    const r = await spawnBazr(["health", "--api", server.baseUrl]);

    expectFinished(r);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("PASS");
  });

  it("a wrong command line exits 2, distinct from a failed request", async () => {
    const r = await spawnBazr(["snipe"]);

    expectFinished(r);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('X  Unknown command "snipe"');
  });

  it("a missing argument exits 2", async () => {
    const r = await spawnBazr(["relic"]);

    expectFinished(r);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Missing argument");
  });
});

describe("the process exits on its own", () => {
  it("leaves nothing running after a successful command", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));

    const r = await spawnBazr(["relic", RELIC_MINT, "--api", server.baseUrl], {
      timeoutMs: 10_000,
    });

    expectFinished(r);
    expect(r.code).toBe(0);
    // A stray referenced timer would push this into seconds.
    expect(r.durationMs).toBeLessThan(5_000);
  });

  it("--help and --version terminate without touching the network", async () => {
    for (const args of [["--help"], ["--version"]]) {
      const r = await spawnBazr(args);
      expectFinished(r);
      expect(r.code).toBe(0);
      expect(r.stdout.trim().length).toBeGreaterThan(0);
    }
  });

  it("documents its exit statuses in --help", async () => {
    const r = await spawnBazr(["--help"]);

    expectFinished(r);
    expect(r.stdout).toContain("EXIT STATUS");
    for (const code of ["0", "1", "2", "70"]) {
      expect(r.stdout).toMatch(new RegExp(`^\\s*${code}\\s`, "m"));
    }
  });
});

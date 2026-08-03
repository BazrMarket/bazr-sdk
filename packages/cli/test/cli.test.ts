import { afterEach, describe, expect, it } from "vitest";
import { findClosedPort, startMockServer } from "./helpers/server.js";
import type { MockServer } from "./helpers/server.js";
import {
  RELIC_MINT,
  cratePayload,
  haggleQuotePayload,
  relicPayload,
  stallListPayload,
} from "./helpers/fixtures.js";
import { BANNED_RE, EMOJI_RE, ansiCount, run, stripAnsi } from "./helpers/run.js";

let server: MockServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

describe("usage surface", () => {
  it("--help lists every command and exits 0", async () => {
    const r = await run(["--help"]);

    expect(r.code).toBe(0);
    for (const cmd of ["relic", "tags", "stalls", "crate list", "crate show", "haggle"]) {
      expect(r.out).toContain(cmd);
    }
    expect(r.out).toContain("BAZR_API");
  });

  it("no arguments prints help and exits 2", async () => {
    const r = await run([]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("USAGE");
  });

  it("--version prints the version", async () => {
    const r = await run(["--version"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("an unknown command exits 2 with an X-prefixed line, not a stack trace", async () => {
    const r = await run(["snipe"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('X  Unknown command "snipe"');
    expect(r.err).not.toContain("at Object.");
  });

  it("an unknown option exits 2", async () => {
    const r = await run(["relic", RELIC_MINT, "--turbo"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown option "--turbo"');
  });

  it("haggle without --in exits 2 and says which option is missing", async () => {
    const r = await run(["haggle", "--out", "MintB", "--amount", "1000"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--in <mint>");
  });

  it("haggle rejects a non-integer amount", async () => {
    const r = await run(["haggle", "--in", "A", "--out", "B", "--amount", "1.5"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--amount must be a whole number");
  });

  it("--sort outside the contract enum exits 2", async () => {
    const r = await run(["stalls", "--sort", "trending"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--sort must be one of record, recent, listings");
  });
});

describe("bazr relic", () => {
  it("renders the tag, the five-axis breakdown and the disclaimer", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    const r = await run(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expect(r.code).toBe(0);
    expect(r.out).toContain("RELIC TAG");
    expect(r.out).toContain(RELIC_MINT);
    expect(r.out).toContain("AXIS BREAKDOWN");
    for (const label of [
      "Holder dispersion",
      "LP residual",
      "Dev wallet state",
      "Floor shape",
      "Social afterglow",
    ]) {
      expect(r.out).toContain(label);
    }
    expect(r.flat).toContain("Survival-signal summary, not a prediction");
  });

  it("prints unknown axes as -- and no data, never as 0", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    const r = await run(["relic", RELIC_MINT, "--api", server.baseUrl]);

    const devLine = r.stdout.find((l) => l.includes("Dev wallet state")) ?? "";
    const socialLine = r.stdout.find((l) => l.includes("Social afterglow")) ?? "";

    expect(devLine).toContain("--");
    expect(devLine).toContain("no data");
    expect(devLine).toContain("excluded");
    expect(devLine).not.toMatch(/\s0(\s|$)/);
    expect(socialLine).toContain("no data");
    expect(r.flat).toContain("not counted as zero");
  });

  it("states how many axes were observed", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    const r = await run(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expect(r.flat).toContain("3 of 5 axes observed");
    expect(r.flat).toContain("75% of the weight");
  });

  it("shows the contribution sum next to the score the API reported", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    const r = await run(["relic", RELIC_MINT, "--api", server.baseUrl]);

    expect(r.flat).toContain("Contributions sum to 46.9");
    expect(r.flat).toContain("the API reported 47");
  });

  it("--refresh reaches the server with ?refresh=true", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    await run(["relic", RELIC_MINT, "--refresh", "--api", server.baseUrl]);

    expect(server.requests[0]?.query.get("refresh")).toBe("true");
  });

  it("--json emits parseable JSON and nothing else", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    const r = await run(["relic", RELIC_MINT, "--json", "--api", server.baseUrl]);

    const parsed = JSON.parse(r.out) as { mint: string; verdict: string };
    expect(parsed.mint).toBe(RELIC_MINT);
    expect(parsed.verdict).toBe("unclear");
  });

  it("reads the base URL from BAZR_API when --api is absent", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    const r = await run(["relic", RELIC_MINT], { env: { BAZR_API: server.baseUrl } });

    expect(r.code).toBe(0);
    expect(server.requests).toHaveLength(1);
  });

  it("renders a score of null as -- rather than 0", async () => {
    const axes = (relicPayload().axes as Array<Record<string, unknown>>).map((a) => ({
      ...a,
      score: null,
      status: "unknown",
    }));
    server = await startMockServer(() => ({
      body: relicPayload({ score: null, axes, verdict: "unclear" }),
    }));
    const r = await run(["relic", RELIC_MINT, "--api", server.baseUrl]);

    const scoreLine = r.stdout.find((l) => l.includes("SCORE")) ?? "";
    expect(scoreLine).toContain("-- / 100");
    expect(r.flat).toContain("0 of 5 axes observed");
  });
});

describe("bazr stalls", () => {
  it("shows wins and losses as separate raw columns and no win rate", async () => {
    server = await startMockServer(() => ({ body: stallListPayload() }));
    const r = await run(["stalls", "--sort", "record", "--api", server.baseUrl]);

    expect(r.code).toBe(0);
    expect(r.out).toContain("WINS");
    expect(r.out).toContain("LOSSES");
    expect(r.out).toContain("PENDING");
    expect(r.flat).toContain("totals: 10 wins, 16 losses, 4 pending");
    expect(r.flat).toContain("No win-rate column");
    expect(r.out.toLowerCase()).not.toContain("win rate");
    expect(r.out.toLowerCase()).not.toContain("win_rate");
  });

  it("gives the WINS and LOSSES columns identical widths", async () => {
    server = await startMockServer(() => ({ body: stallListPayload() }));
    const r = await run(["stalls", "--api", server.baseUrl]);

    const header = stripAnsi(r.stdout.find((l) => l.includes("WINS")) ?? "");
    const winsAt = header.indexOf("WINS");
    const lossesAt = header.indexOf("LOSSES");
    expect(winsAt).toBeGreaterThan(-1);
    expect(lossesAt).toBeGreaterThan(winsAt);
    // Columns are laid out left to right with a fixed two-space gutter.
    expect(header.slice(winsAt + "WINS".length, lossesAt)).toBe("  ");
  });

  it("marks a slashed stall in words", async () => {
    server = await startMockServer(() => ({ body: stallListPayload() }));
    const r = await run(["stalls", "--api", server.baseUrl]);

    expect(r.out).toContain("SLASHED");
    expect(r.out).toContain("YES");
  });

  it("handles an empty ranking without pretending it has data", async () => {
    server = await startMockServer(() => ({ body: { stalls: [], next_cursor: null } }));
    const r = await run(["stalls", "--api", server.baseUrl]);

    expect(r.code).toBe(0);
    expect(r.flat).toContain("no stalls open yet");
  });
});

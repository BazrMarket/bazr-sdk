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

describe("bazr crate", () => {
  it("crate list renders the table", async () => {
    server = await startMockServer(() => ({ body: { crates: [cratePayload()], next_cursor: null } }));
    const r = await run(["crate", "list", "--api", server.baseUrl]);

    expect(r.code).toBe(0);
    expect(r.out).toContain("CRATES");
    expect(r.out).toContain("Q4 2025 survivors");
  });

  it("crate show renders components and flags unscored ones as --", async () => {
    server = await startMockServer(() => ({ body: cratePayload() }));
    const r = await run(["crate", "show", "3", "--api", server.baseUrl]);

    expect(r.code).toBe(0);
    expect(server.requests[0]?.path).toBe("/crate/3");
    expect(r.out).toContain("COMPONENTS");
    expect(r.flat).toContain("weights sum to 100.00%");
    expect(r.flat).toContain("shown as -- not as 0");
  });

  it("crate show without an id exits 2", async () => {
    const r = await run(["crate", "show"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("bazr crate show <id>");
  });
});

describe("bazr haggle", () => {
  it("prints a prominent warning block when price impact is high", async () => {
    server = await startMockServer(() => ({ body: haggleQuotePayload() }));
    const r = await run([
      "haggle", "--in", RELIC_MINT, "--out", "MintB111", "--amount", "1000000",
      "--slippage-bps", "100", "--api", server.baseUrl,
    ]);

    expect(r.code).toBe(0);
    expect(r.out).toContain("WARNING -- THIN LIQUIDITY");
    expect(r.out).toContain("3.40%");
    expect(r.flat).toContain("Thin liquidity: price impact above 3%.");
    expect(r.flat).toContain("nothing has been executed");
    expect(r.out).toContain("jupiter");
  });

  it("escalates the wording above 10% impact", async () => {
    server = await startMockServer(() => ({
      body: { ...haggleQuotePayload(), price_impact_bps: 1500, warning: null },
    }));
    const r = await run([
      "haggle", "--in", RELIC_MINT, "--out", "MintB111", "--amount", "1000000",
      "--api", server.baseUrl,
    ]);

    expect(r.out).toContain("WARNING -- VERY THIN LIQUIDITY");
    expect(r.out).toContain("15.00%");
  });

  it("prints no warning block when impact is low", async () => {
    server = await startMockServer(() => ({
      body: { ...haggleQuotePayload(), price_impact_bps: 12, warning: null },
    }));
    const r = await run([
      "haggle", "--in", RELIC_MINT, "--out", "MintB111", "--amount", "1000000",
      "--api", server.baseUrl,
    ]);

    expect(r.out).not.toContain("WARNING");
    expect(r.out).toContain("0.12%");
  });

  it("sends the request body the contract specifies", async () => {
    server = await startMockServer(() => ({ body: haggleQuotePayload() }));
    await run([
      "haggle", "--in", RELIC_MINT, "--out", "MintB111", "--amount", "1000000",
      "--slippage-bps", "100", "--api", server.baseUrl,
    ]);

    expect(JSON.parse(server.requests[0]?.body ?? "{}")).toEqual({
      input_mint: RELIC_MINT,
      output_mint: "MintB111",
      amount: "1000000",
      slippage_bps: 100,
    });
  });
});

describe("bazr tags", () => {
  it("prints labels only, with confidence and severity", async () => {
    server = await startMockServer(() => ({
      body: { mint: RELIC_MINT, tags: relicPayload().tags },
    }));
    const r = await run(["tags", RELIC_MINT, "--api", server.baseUrl]);

    expect(r.code).toBe(0);
    expect(r.out).toContain("ALERT");
    expect(r.out).toContain("Bundle trace");
    expect(r.out).toContain("LP burned");
    expect(r.out).not.toContain("AXIS BREAKDOWN");
  });

  it("keeps a low-confidence alert visible instead of hiding it", async () => {
    server = await startMockServer(() => ({
      body: {
        mint: RELIC_MINT,
        tags: [
          { key: "rug-trace", label: "Rug trace", severity: "alert", observed: true, confidence: "low", evidence: {} },
        ],
      },
    }));
    const r = await run(["tags", RELIC_MINT, "--api", server.baseUrl]);

    expect(r.out).toContain("Rug trace");
    expect(r.out).toContain("low");
    expect(r.flat).toContain("A low-confidence alert is still shown");
  });
});

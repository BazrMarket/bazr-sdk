// bazr-honesty-allow-file: a test that asserts the contract rejects
// verdicts such as revival, moon and gem has to name them.
import { afterEach, describe, expect, it } from "vitest";
import { createBazrClient } from "../src/index.js";
import { BazrValidationError } from "../src/errors.js";
import { startMockServer } from "./helpers/server.js";
import type { MockServer } from "./helpers/server.js";
import {
  RELIC_MINT,
  cratePayload,
  haggleQuotePayload,
  relicPayload,
  stallListPayload,
} from "./helpers/fixtures.js";

let server: MockServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

const client = (baseUrl: string) =>
  createBazrClient({ baseUrl, retry: { maxAttempts: 1 }, timeoutMs: 5_000 });

describe("HTTP round-trip against a real server", () => {
  it("GET /relic/{mint} round-trips over real HTTP and validates against the contract", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    const relic = await client(server.baseUrl).getRelic(RELIC_MINT);

    expect(server.requests[0]?.path).toBe(`/relic/${RELIC_MINT}`);
    expect(relic.mint).toBe(RELIC_MINT);
    expect(relic.verdict).toBe("unclear");
    expect(relic.axes).toHaveLength(5);
    expect(relic.disclaimer).toContain("not a prediction");
    expect(relic.cache).toEqual({ hit: true, age_s: 120 });
  });

  it("getRelic({ refresh: true }) sends ?refresh=true on the wire", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    await client(server.baseUrl).getRelic(RELIC_MINT, { refresh: true });

    expect(server.requests[0]?.query.get("refresh")).toBe("true");
  });

  it("getRelic without refresh sends no query string", async () => {
    server = await startMockServer(() => ({ body: relicPayload() }));
    await client(server.baseUrl).getRelic(RELIC_MINT);

    expect(server.requests[0]?.url).toBe(`/relic/${RELIC_MINT}`);
  });

  it("fills in the contract disclaimer when the API omits it", async () => {
    server = await startMockServer(() => ({ body: relicPayload({ disclaimer: undefined }) }));
    const relic = await client(server.baseUrl).getRelic(RELIC_MINT);

    expect(relic.disclaimer.length).toBeGreaterThan(0);
  });

  it("getTags round-trips and keeps tag confidence and severity", async () => {
    server = await startMockServer(() => ({
      body: { mint: RELIC_MINT, tags: relicPayload().tags },
    }));
    const result = await client(server.baseUrl).getTags(RELIC_MINT);

    expect(server.requests[0]?.path).toBe(`/relic/${RELIC_MINT}/tags`);
    expect(result.tags.map((t) => t.confidence)).toEqual(["high", "medium"]);
    expect(result.tags.map((t) => t.severity)).toEqual(["info", "alert"]);
  });

  it("listStalls returns resolved_wins and resolved_losses as raw counts (no win_rate)", async () => {
    server = await startMockServer(() => ({ body: stallListPayload() }));
    const list = await client(server.baseUrl).listStalls({ sort: "record", limit: 25 });

    expect(server.requests[0]?.query.get("sort")).toBe("record");
    expect(server.requests[0]?.query.get("limit")).toBe("25");
    expect(list.stalls[0]?.resolved_wins).toBe(9);
    expect(list.stalls[0]?.resolved_losses).toBe(11);
    expect(list.stalls[0]?.resolved_pending).toBe(4);
    expect(list.stalls[1]?.slashed).toBe(true);
    expect(Object.keys(list.stalls[0] ?? {})).not.toContain("win_rate");
  });

  it("getStall detail includes the listings array", async () => {
    const owner = "Curat0r1111111111111111111111111111111111111";
    server = await startMockServer(() => ({
      body: {
        ...(stallListPayload().stalls as Record<string, unknown>[])[0],
        listings: [
          {
            mint: RELIC_MINT,
            relic_score_at_listing: 51,
            thesis: "LP still parked, dev wallet quiet.",
            outcome: "pending",
            listed_at: "2026-03-01T00:00:00Z",
            resolved_at: null,
          },
        ],
      },
    }));
    const stall = await client(server.baseUrl).getStall(owner);

    expect(server.requests[0]?.path).toBe(`/stall/${owner}`);
    expect(stall.listings).toHaveLength(1);
    expect(stall.listings[0]?.outcome).toBe("pending");
  });

  it("listCrates accepts the envelope shape", async () => {
    server = await startMockServer(() => ({ body: { crates: [cratePayload()], next_cursor: "c2" } }));
    const list = await client(server.baseUrl).listCrates();

    expect(list.crates).toHaveLength(1);
    expect(list.next_cursor).toBe("c2");
  });

  it("listCrates accepts a bare array shape", async () => {
    server = await startMockServer(() => ({ body: [cratePayload()] }));
    const list = await client(server.baseUrl).listCrates();

    expect(list.crates[0]?.name).toBe("Q4 2025 survivors");
    expect(list.next_cursor).toBeNull();
  });

  it("getCrate round-trips component weights", async () => {
    server = await startMockServer(() => ({ body: cratePayload() }));
    const crate = await client(server.baseUrl).getCrate(3);

    expect(server.requests[0]?.path).toBe("/crate/3");
    expect(crate.components.reduce((s, c) => s + c.weight_bps, 0)).toBe(10_000);
    expect(crate.components[1]?.relic_score).toBeNull();
  });

  it("quoteHaggle POSTs a JSON body and parses the route", async () => {
    server = await startMockServer(() => ({ body: haggleQuotePayload() }));
    const quote = await client(server.baseUrl).quoteHaggle({
      input_mint: RELIC_MINT,
      output_mint: "MintB111",
      amount: "1000000",
      slippage_bps: 100,
    });

    const sent = server.requests[0];
    expect(sent?.method).toBe("POST");
    expect(sent?.path).toBe("/haggle/quote");
    expect(sent?.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(sent?.body ?? "{}")).toEqual({
      input_mint: RELIC_MINT,
      output_mint: "MintB111",
      amount: "1000000",
      slippage_bps: 100,
    });
    expect(quote.source).toBe("jupiter");
    expect(quote.price_impact_bps).toBe(340);
    expect(quote.route[0]?.amm).toBe("Raydium CLMM");
  });

  it("quoteHaggle normalises a numeric amount to a string on the wire", async () => {
    server = await startMockServer(() => ({ body: haggleQuotePayload() }));
    await client(server.baseUrl).quoteHaggle({
      input_mint: RELIC_MINT,
      output_mint: "MintB111",
      amount: 1_000_000,
    });

    expect(JSON.parse(server.requests[0]?.body ?? "{}").amount).toBe("1000000");
  });

  it("getStats tolerates keys the service left out", async () => {
    server = await startMockServer(() => ({ body: { relics_scored: 0, data_cluster: "mainnet" } }));
    const stats = await client(server.baseUrl).getStats();

    expect(stats.relics_scored).toBe(0);
    expect(stats.stalls).toBeNull();
    expect(stats.data_cluster).toBe("mainnet");
  });

  it("getStats leaves an absent program_cluster absent rather than defaulting it", async () => {
    // The unread counters above come back as null, but this one must not: a
    // missing program_cluster means nothing is deployed, and manufacturing a
    // value for it -- least of all data_cluster's -- is how a devnet program
    // gets advertised as running on mainnet.
    server = await startMockServer(() => ({ body: { relics_scored: 0, data_cluster: "mainnet" } }));
    const stats = await client(server.baseUrl).getStats();

    expect(stats.program_cluster).toBeUndefined();
    expect("program_cluster" in stats).toBe(false);
    expect(stats.data_cluster).toBe("mainnet");
  });

  it("getStats reports program_cluster apart from data_cluster when both are sent", async () => {
    server = await startMockServer(() => ({
      body: { relics_scored: 0, data_cluster: "mainnet", program_cluster: "devnet" },
    }));
    const stats = await client(server.baseUrl).getStats();

    expect(stats.data_cluster).toBe("mainnet");
    expect(stats.program_cluster).toBe("devnet");
  });

  it("getHealth round-trips", async () => {
    server = await startMockServer(() => ({ body: { status: "ok", version: "0.1.0", uptime_s: 12 } }));
    const health = await client(server.baseUrl).getHealth();

    expect(health.status).toBe("ok");
  });

  it("throws BazrValidationError instead of yielding undefined when a field is missing", async () => {
    const broken = relicPayload();
    delete (broken as Record<string, unknown>).verdict;
    server = await startMockServer(() => ({ body: broken }));

    await expect(client(server.baseUrl).getRelic(RELIC_MINT)).rejects.toBeInstanceOf(
      BazrValidationError,
    );
  });

  it("rejects a verdict outside the contract enum (revival/moon/gem are not verdicts)", async () => {
    server = await startMockServer(() => ({ body: relicPayload({ verdict: "revival" }) }));

    const err = await client(server.baseUrl)
      .getRelic(RELIC_MINT)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BazrValidationError);
    expect((err as BazrValidationError).issues[0]?.path).toBe("verdict");
  });

  it("throws BazrValidationError when a 200 body is not JSON", async () => {
    server = await startMockServer(() => ({ body: "<html>gateway</html>" }));

    await expect(client(server.baseUrl).getRelic(RELIC_MINT)).rejects.toBeInstanceOf(
      BazrValidationError,
    );
  });
});

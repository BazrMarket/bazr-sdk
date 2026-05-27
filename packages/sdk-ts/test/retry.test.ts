import { afterEach, describe, expect, it } from "vitest";
import { createBazrClient, parseRetryAfter, computeBackoff, resolveRetryOptions } from "../src/index.js";
import {
  BazrApiError,
  BazrNetworkError,
  BazrRateLimitError,
  BazrTimeoutError,
  describeError,
} from "../src/errors.js";
import { findClosedPort, recordingSleep, startMockServer } from "./helpers/server.js";
import type { MockServer } from "./helpers/server.js";
import { RELIC_MINT, relicPayload } from "./helpers/fixtures.js";

let server: MockServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

describe("429 rate-limit backoff", () => {
  it("429 honours Retry-After in seconds and retries after exactly that delay", async () => {
    server = await startMockServer((_req, i) =>
      i === 0
        ? { status: 429, headers: { "retry-after": "2" }, body: { error: { code: "rate_limited", message: "slow down" } } }
        : { body: relicPayload() },
    );
    const { delays, sleep } = recordingSleep();
    const client = createBazrClient({
      baseUrl: server.baseUrl,
      retry: { maxAttempts: 3, sleep, jitter: false },
    });

    const relic = await client.getRelic(RELIC_MINT);

    expect(relic.mint).toBe(RELIC_MINT);
    expect(server.requests).toHaveLength(2);
    expect(delays).toEqual([2000]);
  });

  it("429 really waits and recovers end-to-end with an un-mocked sleep", async () => {
    server = await startMockServer((_req, i) =>
      i === 0 ? { status: 429, headers: { "retry-after": "0" }, body: {} } : { body: relicPayload() },
    );
    const client = createBazrClient({
      baseUrl: server.baseUrl,
      retry: { maxAttempts: 3, jitter: false, baseDelayMs: 1 },
    });

    const relic = await client.getRelic(RELIC_MINT);

    expect(relic.score).toBe(47);
    expect(server.requests).toHaveLength(2);
  });

  it("429 honours an HTTP-date Retry-After", async () => {
    const when = new Date(Date.now() + 3_000).toUTCString();
    server = await startMockServer((_req, i) =>
      i === 0 ? { status: 429, headers: { "retry-after": when }, body: {} } : { body: relicPayload() },
    );
    const { delays, sleep } = recordingSleep();
    const client = createBazrClient({
      baseUrl: server.baseUrl,
      retry: { maxAttempts: 3, sleep, jitter: false },
    });

    await client.getRelic(RELIC_MINT);

    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThan(1_000);
    expect(delays[0]).toBeLessThanOrEqual(3_000);
  });

  it("429 falls back to exponential backoff when Retry-After is absent", async () => {
    server = await startMockServer((_req, i) =>
      i < 2 ? { status: 429, body: {} } : { body: relicPayload() },
    );
    const { delays, sleep } = recordingSleep();
    const client = createBazrClient({
      baseUrl: server.baseUrl,
      retry: { maxAttempts: 3, sleep, jitter: false, baseDelayMs: 100 },
    });

    await client.getRelic(RELIC_MINT);

    expect(delays).toEqual([100, 200]);
  });

  it("429 with a Retry-After above maxRetryAfterMs throws instead of sleeping for minutes", async () => {
    server = await startMockServer(() => ({ status: 429, headers: { "retry-after": "600" }, body: {} }));
    const { delays, sleep } = recordingSleep();
    const client = createBazrClient({
      baseUrl: server.baseUrl,
      retry: { maxAttempts: 3, sleep, maxRetryAfterMs: 30_000 },
    });

    const err = await client.getRelic(RELIC_MINT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BazrRateLimitError);
    expect((err as BazrRateLimitError).retryAfterMs).toBe(600_000);
    expect(delays).toEqual([]);
    expect(server.requests).toHaveLength(1);
  });

  it("429 on every attempt throws BazrRateLimitError carrying retryAfterMs", async () => {
    server = await startMockServer(() => ({
      status: 429,
      headers: { "retry-after": "1" },
      body: { error: { code: "rate_limited", message: "30 req/min exceeded" } },
    }));
    const { sleep } = recordingSleep();
    const client = createBazrClient({
      baseUrl: server.baseUrl,
      retry: { maxAttempts: 2, sleep, jitter: false },
    });

    const err = await client.getRelic(RELIC_MINT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BazrRateLimitError);
    expect((err as BazrRateLimitError).retryAfterMs).toBe(1_000);
    expect((err as BazrRateLimitError).attempts).toBe(2);
    expect((err as BazrRateLimitError).message).toContain("30 req/min exceeded");
    expect(server.requests).toHaveLength(2);
    expect(describeError(err)).toContain("Rate limited");
  });

  it("parseRetryAfter reads seconds, HTTP-dates, and rejects junk", () => {
    const now = Date.parse("2026-03-10T00:00:00Z");
    expect(parseRetryAfter("5", now)).toBe(5_000);
    expect(parseRetryAfter("0", now)).toBe(0);
    expect(parseRetryAfter("Tue, 10 Mar 2026 00:00:10 GMT", now)).toBe(10_000);
    expect(parseRetryAfter("later", now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter("  ", now)).toBeNull();
  });
});

describe("5xx exponential backoff", () => {
  it("5xx retries with exponential backoff and then succeeds", async () => {
    server = await startMockServer((_req, i) =>
      i < 2 ? { status: 503, body: { error: { code: "upstream_down", message: "rpc down" } } } : { body: relicPayload() },
    );
    const { delays, sleep } = recordingSleep();
    const client = createBazrClient({
      baseUrl: server.baseUrl,
      retry: { maxAttempts: 3, sleep, jitter: false, baseDelayMs: 250 },
    });

    const relic = await client.getRelic(RELIC_MINT);

    expect(relic.mint).toBe(RELIC_MINT);
    expect(server.requests).toHaveLength(3);
    expect(delays).toEqual([250, 500]);
  });

  it("5xx backoff respects maxDelayMs", () => {
    const opts = resolveRetryOptions({ jitter: false, baseDelayMs: 1_000, maxDelayMs: 2_000 });
    expect(computeBackoff(1, opts)).toBe(1_000);
    expect(computeBackoff(2, opts)).toBe(2_000);
    expect(computeBackoff(5, opts)).toBe(2_000);
  });

  it("5xx that never recovers throws BazrApiError with the server error code", async () => {
    server = await startMockServer(() => ({
      status: 500,
      body: { error: { code: "indexer_stalled", message: "indexer is behind" } },
    }));
    const { sleep } = recordingSleep();
    const client = createBazrClient({ baseUrl: server.baseUrl, retry: { maxAttempts: 3, sleep } });

    const err = await client.getRelic(RELIC_MINT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BazrApiError);
    expect((err as BazrApiError).status).toBe(500);
    expect((err as BazrApiError).code).toBe("indexer_stalled");
    expect(server.requests).toHaveLength(3);
  });
});

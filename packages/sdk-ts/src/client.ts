/**
 * The BAZR API client.
 *
 * Every response is validated against the contract schemas before it is
 * returned, so a caller never receives a half-parsed object.
 */

import { z } from "zod";
import { BazrConfigError, BazrValidationError } from "./errors.js";
import type { BazrValidationIssue } from "./errors.js";
import { requestJson, resolveRetryOptions } from "./http.js";
import type { FetchLike, RequestDeps, RetryOptions } from "./http.js";
import {
  CrateListSchema,
  CrateSchema,
  HaggleQuoteRequestSchema,
  HaggleQuoteSchema,
  HealthDetailedSchema,
  HealthSchema,
  MarketStatsSchema,
  RelicSchema,
  RelicTagsSchema,
  StallDetailSchema,
  StallListSchema,
} from "./schemas.js";
import type {
  Crate,
  CrateList,
  HaggleQuote,
  HaggleQuoteRequest,
  Health,
  HealthDetailed,
  MarketStats,
  Relic,
  RelicTags,
  StallDetail,
  StallList,
  StallSort,
} from "./schemas.js";

/** Dev default from the API contract. */
export const DEFAULT_BASE_URL = "http://localhost:8030";

export interface BazrClientOptions {
  /** e.g. `http://localhost:8030`. Trailing slashes are trimmed. */
  baseUrl: string;
  /** Defaults to the global `fetch` (Node 18+ / browsers). */
  fetch?: FetchLike;
  /** Per-attempt timeout. Default 10000ms. 0 disables it. */
  timeoutMs?: number;
  retry?: RetryOptions;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
  /** Set null to send no user-agent (browsers forbid setting it). */
  userAgent?: string | null;
}

export interface CallOptions {
  signal?: unknown;
}

export interface GetRelicOptions extends CallOptions {
  /** Bypass the server cache. Rate limited far more tightly than a plain read. */
  refresh?: boolean;
}

export interface ListStallsOptions extends CallOptions {
  sort?: StallSort;
  limit?: number;
  cursor?: string;
}

export interface ListCratesOptions extends CallOptions {
  limit?: number;
  cursor?: string;
}

export interface BazrClient {
  readonly baseUrl: string;
  getHealth(opts?: CallOptions): Promise<Health>;
  getHealthDetailed(opts?: CallOptions): Promise<HealthDetailed>;
  getRelic(mint: string, opts?: GetRelicOptions): Promise<Relic>;
  getTags(mint: string, opts?: CallOptions): Promise<RelicTags>;
  listStalls(opts?: ListStallsOptions): Promise<StallList>;
  getStall(owner: string, opts?: CallOptions): Promise<StallDetail>;
  listCrates(opts?: ListCratesOptions): Promise<CrateList>;
  getCrate(id: number | string, opts?: CallOptions): Promise<Crate>;
  quoteHaggle(req: HaggleQuoteRequest, opts?: CallOptions): Promise<HaggleQuote>;
  getStats(opts?: CallOptions): Promise<MarketStats>;
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") {
    throw new BazrConfigError("baseUrl is required (for example http://localhost:8030)");
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new BazrConfigError(`baseUrl must start with http:// or https:// (got "${trimmed}")`);
  }
  return trimmed.replace(/\/+$/, "");
}

function resolveFetch(injected: FetchLike | undefined): FetchLike {
  if (injected) return injected;
  const globalFetch = (globalThis as { fetch?: unknown }).fetch;
  if (typeof globalFetch !== "function") {
    throw new BazrConfigError(
      "No fetch implementation found. Use Node 18+ or pass { fetch } explicitly.",
    );
  }
  return globalFetch.bind(globalThis) as FetchLike;
}

type QueryValue = string | number | boolean | undefined;

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const segments = path
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join("/");
  let url = `${baseUrl}/${segments}`;
  if (query) {
    const pairs = Object.entries(query)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    if (pairs.length > 0) url += `?${pairs.join("&")}`;
  }
  return url;
}

function zodIssues(error: z.ZodError): BazrValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((p) => String(p)).join("."),
    message: issue.message,
  }));
}

function parseOrThrow<S extends z.ZodType>(
  schema: S,
  data: unknown,
  ctx: { url: string; method: string },
): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new BazrValidationError(
    `Response from ${ctx.method} ${ctx.url} did not match the BAZR API contract`,
    { url: ctx.url, method: ctx.method, issues: zodIssues(result.error), received: data },
  );
}

function requireNonEmpty(value: string, name: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new BazrConfigError(`${name} is required`);
  return trimmed;
}

export function createBazrClient(options: BazrClientOptions): BazrClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const deps: RequestDeps = {
    fetch: resolveFetch(options.fetch),
    timeoutMs: options.timeoutMs ?? 10_000,
    retry: resolveRetryOptions(options.retry),
    userAgent: options.userAgent === undefined ? "bazr-sdk/0.1.0" : options.userAgent,
  };
  const baseHeaders = options.headers ?? {};

  async function call<S extends z.ZodType>(
    method: string,
    path: string,
    schema: S,
    extra: { query?: Record<string, QueryValue>; body?: unknown; signal?: unknown } = {},
  ): Promise<z.infer<S>> {
    const url = buildUrl(baseUrl, path, extra.query);
    const raw = await requestJson(
      {
        method,
        url,
        headers: baseHeaders,
        ...(extra.body === undefined ? {} : { body: extra.body }),
        ...(extra.signal === undefined ? {} : { signal: extra.signal }),
      },
      deps,
    );
    return parseOrThrow(schema, raw, { url, method });
  }

  return {
    baseUrl,

    getHealth(opts) {
      return call("GET", "/health", HealthSchema, { signal: opts?.signal });
    },

    getHealthDetailed(opts) {
      return call("GET", "/health/detailed", HealthDetailedSchema, { signal: opts?.signal });
    },

    getRelic(mint, opts) {
      const id = requireNonEmpty(mint, "mint");
      return call("GET", `/relic/${id}`, RelicSchema, {
        query: opts?.refresh ? { refresh: true } : undefined,
        signal: opts?.signal,
      });
    },

    getTags(mint, opts) {
      const id = requireNonEmpty(mint, "mint");
      return call("GET", `/relic/${id}/tags`, RelicTagsSchema, { signal: opts?.signal });
    },

    listStalls(opts) {
      return call("GET", "/stall", StallListSchema, {
        query: { sort: opts?.sort, limit: opts?.limit, cursor: opts?.cursor },
        signal: opts?.signal,
      });
    },

    getStall(owner, opts) {
      const id = requireNonEmpty(owner, "owner");
      return call("GET", `/stall/${id}`, StallDetailSchema, { signal: opts?.signal });
    },

    listCrates(opts) {
      return call("GET", "/crate", CrateListSchema, {
        query: { limit: opts?.limit, cursor: opts?.cursor },
        signal: opts?.signal,
      });
    },

    getCrate(id, opts) {
      const crateId = requireNonEmpty(String(id ?? ""), "crate id");
      return call("GET", `/crate/${crateId}`, CrateSchema, { signal: opts?.signal });
    },

    quoteHaggle(req, opts) {
      const parsed = HaggleQuoteRequestSchema.safeParse(req);
      if (!parsed.success) {
        throw new BazrConfigError(
          `Invalid haggle quote request: ${zodIssues(parsed.error)
            .map((i) => `${i.path || "<root>"} ${i.message}`)
            .join("; ")}`,
        );
      }
      return call("POST", "/haggle/quote", HaggleQuoteSchema, {
        body: parsed.data,
        signal: opts?.signal,
      });
    },

    getStats(opts) {
      return call("GET", "/market/stats", MarketStatsSchema, { signal: opts?.signal });
    },
  };
}

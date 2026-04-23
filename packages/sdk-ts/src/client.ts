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

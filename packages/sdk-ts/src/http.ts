/**
 * Transport layer: timeouts, retries, and honest failures.
 *
 * Retry policy, in one place so it can be reasoned about:
 *   429      -> honour `Retry-After` (seconds or HTTP-date), capped by
 *               `maxRetryAfterMs`; otherwise fall back to exponential backoff.
 *   5xx      -> exponential backoff with jitter.
 *   other 4xx-> throw immediately. Retrying a 400 just burns the rate limit.
 *   network  -> exponential backoff (the request never reached the server).
 * Exhausting the attempts throws. It never resolves to a placeholder value.
 */

import {
  BazrApiError,
  BazrNetworkError,
  BazrRateLimitError,
  BazrTimeoutError,
  BazrValidationError,
} from "./errors.js";
import { ApiErrorEnvelopeSchema } from "./schemas.js";

/* -------------------------------------------------------------------------- */
/* minimal structural fetch types (works with browser fetch and node fetch)     */
/* -------------------------------------------------------------------------- */

export interface FetchHeaders {
  get(name: string): string | null;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers: FetchHeaders;
  text(): Promise<string>;
}

export interface FetchInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: unknown;
}

export type FetchLike = (url: string, init?: FetchInitLike) => Promise<FetchResponseLike>;

/* -------------------------------------------------------------------------- */
/* retry configuration                                                         */
/* -------------------------------------------------------------------------- */

export type RetryReason = "rate_limit" | "server_error" | "network" | "timeout";

export interface RetryInfo {
  attempt: number;
  delayMs: number;
  reason: RetryReason;
  status: number | null;
  url: string;
}

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  /** First backoff step. Default 250ms. */
  baseDelayMs?: number;
  /** Ceiling for a single backoff step. Default 8000ms. */
  maxDelayMs?: number;
  /** A `Retry-After` longer than this is not waited out; it throws. Default 30000ms. */
  maxRetryAfterMs?: number;
  /** Randomise backoff to avoid a retry stampede. Default true. */
  jitter?: boolean;
  /** Retry when the request never reached the server. Default true. */
  retryOnNetworkError?: boolean;
  /** Injectable for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Observability hook, fired before each wait. */
  onRetry?: (info: RetryInfo) => void;
}

export interface ResolvedRetryOptions extends Required<Omit<RetryOptions, "onRetry">> {
  onRetry: ((info: RetryInfo) => void) | null;
}

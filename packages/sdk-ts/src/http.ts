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

/**
 * The backoff wait between attempts.
 *
 * The timer is deliberately kept referenced. A previous version called
 * `unref()` on it "so a backoff would not hold the process open", which does
 * the opposite of what it reads like: this promise is awaited, and an unref'd
 * timer does not count as work. By the time the retry loop gets here the
 * failed request has already released its socket, so the event loop is empty,
 * Node exits, and `await sleep(...)` never settles.
 *
 * In a library that is a leak. In a bare CLI process it is worse: the whole
 * `await runCli(...)` chain silently evaporates. Measured against the
 * production service, `bazr relic <mint>` died exactly this way on every
 * cache miss -- Node printed "Detected unsettled top-level await", no result
 * was produced, and the exit status did not say the run had failed.
 *
 * A caller that genuinely wants to abandon a pending backoff injects its own
 * `sleep` via {@link RetryOptions}; that decision does not belong in the
 * default.
 */
export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function resolveRetryOptions(opts: RetryOptions | undefined): ResolvedRetryOptions {
  return {
    maxAttempts: Math.max(1, opts?.maxAttempts ?? 3),
    baseDelayMs: Math.max(0, opts?.baseDelayMs ?? 250),
    maxDelayMs: Math.max(0, opts?.maxDelayMs ?? 8_000),
    maxRetryAfterMs: Math.max(0, opts?.maxRetryAfterMs ?? 30_000),
    jitter: opts?.jitter ?? true,
    retryOnNetworkError: opts?.retryOnNetworkError ?? true,
    sleep: opts?.sleep ?? defaultSleep,
    onRetry: opts?.onRetry ?? null,
  };
}

/**
 * `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110). Both are
 * seen in the wild; guessing wrong means either hammering the server or
 * sleeping for a wall-clock timestamp.
 */
export function parseRetryAfter(raw: string | null, nowMs: number = Date.now()): number | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (value === "") return null;

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Math.max(0, Math.round(Number(value) * 1000));
  }

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - nowMs);

  return null;
}

export function computeBackoff(attempt: number, opts: ResolvedRetryOptions): number {
  const exponential = opts.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(opts.maxDelayMs, exponential);
  if (!opts.jitter) return Math.round(capped);
  // Equal jitter: keeps half the backoff deterministic, randomises the rest.
  return Math.round(capped / 2 + Math.random() * (capped / 2));
}

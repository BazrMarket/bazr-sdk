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

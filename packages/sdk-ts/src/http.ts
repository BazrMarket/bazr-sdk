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

/* -------------------------------------------------------------------------- */
/* request                                                                     */
/* -------------------------------------------------------------------------- */

export interface RequestSpec {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: unknown;
}

export interface RequestDeps {
  fetch: FetchLike;
  timeoutMs: number;
  retry: ResolvedRetryOptions;
  userAgent: string | null;
}

interface AbortControllerLike {
  signal: unknown;
  abort(): void;
}

function newAbortController(): AbortControllerLike | null {
  const ctor = (globalThis as { AbortController?: new () => AbortControllerLike }).AbortController;
  return typeof ctor === "function" ? new ctor() : null;
}

function decodeErrorBody(body: string): { code?: string; message?: string; detail?: unknown } {
  if (body.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {};
  }
  const envelope = ApiErrorEnvelopeSchema.safeParse(parsed);
  if (envelope.success) return envelope.data.error;
  // Some proxies answer with `{"detail": "..."}`; use it rather than dropping it.
  if (parsed && typeof parsed === "object" && "detail" in parsed) {
    const detail = (parsed as { detail: unknown }).detail;
    if (typeof detail === "string") return { message: detail };
    return { detail };
  }
  return {};
}

function truncate(text: string, max = 500): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

async function fetchOnce(
  spec: RequestSpec,
  deps: RequestDeps,
  attempt: number,
): Promise<FetchResponseLike> {
  const controller = newAbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (controller && deps.timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, deps.timeoutMs);
  }

  const headers: Record<string, string> = { accept: "application/json", ...spec.headers };
  if (spec.body !== undefined) headers["content-type"] = "application/json";
  if (deps.userAgent) headers["user-agent"] = deps.userAgent;

  try {
    return await deps.fetch(spec.url, {
      method: spec.method,
      headers,
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      ...(controller ? { signal: controller.signal } : spec.signal ? { signal: spec.signal } : {}),
    });
  } catch (cause) {
    if (timedOut) {
      throw new BazrTimeoutError(
        `Request timed out after ${deps.timeoutMs}ms`,
        { url: spec.url, method: spec.method, attempts: attempt, timeoutMs: deps.timeoutMs, cause },
      );
    }
    throw new BazrNetworkError(networkMessage(cause), {
      url: spec.url,
      method: spec.method,
      attempts: attempt,
      cause,
    });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function networkMessage(cause: unknown): string {
  const err = cause as { message?: string; cause?: { code?: string; message?: string } };
  const code = err?.cause?.code;
  const base = err?.message ?? String(cause);
  return code ? `${base} (${code})` : base;
}

/** Performs the request with the retry policy and returns the raw JSON value. */
export async function requestJson(spec: RequestSpec, deps: RequestDeps): Promise<unknown> {
  const { retry } = deps;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
    const isLast = attempt === retry.maxAttempts;
    let res: FetchResponseLike;

    try {
      res = await fetchOnce(spec, deps, attempt);
    } catch (err) {
      lastError = err;
      const reason: RetryReason = err instanceof BazrTimeoutError ? "timeout" : "network";
      if (isLast || !retry.retryOnNetworkError) throw err;
      const delayMs = computeBackoff(attempt, retry);
      retry.onRetry?.({ attempt, delayMs, reason, status: null, url: spec.url });
      await retry.sleep(delayMs);
      continue;
    }

    if (res.ok) {
      const text = await res.text();
      if (text.trim() === "") return null;
      try {
        return JSON.parse(text) as unknown;
      } catch (cause) {
        throw new BazrValidationError("Response body was not valid JSON", {
          url: spec.url,
          method: spec.method,
          attempts: attempt,
          received: truncate(text),
          cause,
        });
      }
    }

    const body = await res.text().catch(() => "");
    const decoded = decodeErrorBody(body);
    const message = decoded.message ?? res.statusText ?? `HTTP ${res.status}`;

    if (res.status === 429) {
      const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
      const wait = retryAfterMs ?? computeBackoff(attempt, retry);
      const tooLong = retryAfterMs !== null && retryAfterMs > retry.maxRetryAfterMs;

      if (isLast || tooLong) {
        throw new BazrRateLimitError(message, {
          url: spec.url,
          method: spec.method,
          attempts: attempt,
          code: decoded.code ?? "rate_limited",
          detail: decoded.detail,
          body: truncate(body),
          retryAfterMs,
        });
      }
      retry.onRetry?.({ attempt, delayMs: wait, reason: "rate_limit", status: 429, url: spec.url });
      await retry.sleep(wait);
      continue;
    }

    if (res.status >= 500) {
      const apiError = new BazrApiError(message, {
        url: spec.url,
        method: spec.method,
        attempts: attempt,
        status: res.status,
        code: decoded.code,
        detail: decoded.detail,
        body: truncate(body),
      });
      lastError = apiError;
      if (isLast) throw apiError;
      const delayMs = computeBackoff(attempt, retry);
      retry.onRetry?.({
        attempt,
        delayMs,
        reason: "server_error",
        status: res.status,
        url: spec.url,
      });
      await retry.sleep(delayMs);
      continue;
    }

    // 4xx other than 429: the request itself is wrong. Retrying cannot fix it.
    throw new BazrApiError(message, {
      url: spec.url,
      method: spec.method,
      attempts: attempt,
      status: res.status,
      code: decoded.code,
      detail: decoded.detail,
      body: truncate(body),
    });
  }

  /* istanbul ignore next -- the loop always returns or throws */
  throw lastError ?? new BazrNetworkError("Request failed with no response", { url: spec.url });
}

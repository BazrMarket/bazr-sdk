/**
 * Error taxonomy for the BAZR SDK.
 *
 * Every failure surfaces as a thrown error carrying enough context to be
 * rendered for a human. Nothing is swallowed into an empty object -- a caller
 * that gets a value back can trust that the value was validated.
 */

export type BazrErrorKind =
  | "api"
  | "rate_limit"
  | "network"
  | "timeout"
  | "validation"
  | "config";

export interface BazrErrorContext {
  /** Absolute request URL, when the failure happened around a request. */
  url?: string;
  /** HTTP method of the failing request. */
  method?: string;
  /** How many attempts (including the first) were spent before giving up. */
  attempts?: number;
  cause?: unknown;
}

export class BazrError extends Error {
  readonly kind: BazrErrorKind;
  readonly url: string | undefined;
  readonly method: string | undefined;
  readonly attempts: number;

  constructor(kind: BazrErrorKind, message: string, ctx: BazrErrorContext = {}) {
    super(message, ctx.cause === undefined ? undefined : { cause: ctx.cause });
    this.name = new.target.name;
    this.kind = kind;
    this.url = ctx.url;
    this.method = ctx.method;
    this.attempts = ctx.attempts ?? 1;
    // Keeps `instanceof` working when the bundle is transpiled down.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A response arrived, but the server said no. */
export class BazrApiError extends BazrError {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;
  readonly body: string | undefined;

  constructor(
    message: string,
    opts: BazrErrorContext & {
      status: number;
      code?: string;
      detail?: unknown;
      body?: string;
      kind?: BazrErrorKind;
    },
  ) {
    super(opts.kind ?? "api", message, opts);
    this.status = opts.status;
    this.code = opts.code ?? `http_${opts.status}`;
    this.detail = opts.detail;
    this.body = opts.body;
  }
}

/** HTTP 429. `retryAfterMs` is whatever `Retry-After` said, in milliseconds. */
export class BazrRateLimitError extends BazrApiError {
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    opts: BazrErrorContext & {
      status?: number;
      code?: string;
      detail?: unknown;
      body?: string;
      retryAfterMs: number | null;
    },
  ) {
    super(message, { ...opts, status: opts.status ?? 429, kind: "rate_limit" });
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** The request never produced a response (DNS, refused connection, TLS, ...). */
export class BazrNetworkError extends BazrError {
  constructor(message: string, ctx: BazrErrorContext = {}) {
    super("network", message, ctx);
  }
}

/** The request was aborted because it outlived `timeoutMs`. */
export class BazrTimeoutError extends BazrError {
  readonly timeoutMs: number;

  constructor(message: string, opts: BazrErrorContext & { timeoutMs: number }) {
    super("timeout", message, opts);
    this.timeoutMs = opts.timeoutMs;
  }
}

export interface BazrValidationIssue {
  path: string;
  message: string;
}

/**
 * A 2xx response whose body did not match the API contract.
 *
 * This is deliberately loud. Without it a renamed or dropped field turns into
 * `undefined` flowing quietly through the caller's code.
 */
export class BazrValidationError extends BazrError {
  readonly issues: BazrValidationIssue[];
  readonly received: unknown;

  constructor(
    message: string,
    opts: BazrErrorContext & { issues?: BazrValidationIssue[]; received?: unknown },
  ) {
    super("validation", message, opts);
    this.issues = opts.issues ?? [];
    this.received = opts.received;
  }
}

/** Bad client configuration (empty base URL, no fetch implementation, ...). */
export class BazrConfigError extends BazrError {
  constructor(message: string) {
    super("config", message);
  }
}

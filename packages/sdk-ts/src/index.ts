/**
 * `@bazr/sdk` -- typed client for the BAZR relic API.
 *
 * BAZR scores tokens that already graduated from a launchpad. A relic score is
 * a summary of survival signals, not a prediction of price or revival.
 */

export { createBazrClient, DEFAULT_BASE_URL } from "./client.js";
export type {
  BazrClient,
  BazrClientOptions,
  CallOptions,
  GetRelicOptions,
  ListCratesOptions,
  ListStallsOptions,
} from "./client.js";

export {
  BazrApiError,
  BazrConfigError,
  BazrError,
  BazrNetworkError,
  BazrRateLimitError,
  BazrTimeoutError,
  BazrValidationError,
  describeError,
  errorHints,
  isBazrError,
} from "./errors.js";
export type { BazrErrorKind, BazrValidationIssue } from "./errors.js";

export {
  computeBackoff,
  defaultSleep,
  parseRetryAfter,
  resolveRetryOptions,
} from "./http.js";
export type {
  FetchInitLike,
  FetchLike,
  FetchResponseLike,
  RetryInfo,
  RetryOptions,
  RetryReason,
} from "./http.js";

export {
  axisRows,
  describeCoverage,
  isAxisObservable,
  normalizedScore,
  relicScoreBreakdown,
} from "./score.js";
export type { AxisContribution, AxisRow, NormalizedScore } from "./score.js";

export {
  AXIS_FALLBACK_LABELS,
  AXIS_KEYS,
  AxisKeySchema,
  AxisSchema,
  AxisStatusSchema,
  CacheInfoSchema,
  CrateComponentSchema,
  CrateListSchema,
  CrateSchema,
  DEFAULT_DISCLAIMER,
  HaggleQuoteRequestSchema,
  HaggleQuoteSchema,
  HealthDetailedSchema,
  HealthSchema,
  MarketStatsSchema,
  RelicSchema,
  RelicTagsSchema,
  RouteHopSchema,
  SourceRefSchema,
  StallDetailSchema,
  StallListSchema,
  StallListingSchema,
  StallSchema,
  StallSortSchema,
  TagConfidenceSchema,
  TagSchema,
  TagSeveritySchema,
  VERDICTS,
  VerdictSchema,
} from "./schemas.js";
export type {
  ApiErrorEnvelope,
  Axis,
  AxisKey,
  AxisStatus,
  CacheInfo,
  Crate,
  CrateComponent,
  CrateList,
  HaggleQuote,
  HaggleQuoteRequest,
  Health,
  HealthComponent,
  HealthDetailed,
  MarketStats,
  Relic,
  RelicTags,
  RouteHop,
  SourceRef,
  Stall,
  StallDetail,
  StallList,
  StallListing,
  StallSort,
  Tag,
  TagConfidence,
  TagSeverity,
  Verdict,
} from "./schemas.js";

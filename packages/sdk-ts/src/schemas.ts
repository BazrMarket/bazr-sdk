/**
 * Wire-format schemas for the BAZR API.
 *
 * `docs/api-contract.md` is the source of truth; every shape below mirrors it.
 * That contract lives in the main repository:
 * https://github.com/BazrMarket/bazr/blob/main/docs/api-contract.md
 * Types are inferred from the schemas, never hand-written, so a schema edit and
 * a type edit cannot drift apart.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* primitives                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Integer amounts cross the wire as strings (lamport scale overflows float64).
 * Numbers are accepted and normalised to string rather than rejected, because
 * silently losing precision is worse than a boring coercion.
 */
const amount = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v));

const isoTimestamp = z.string();
const nullableTimestamp = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const nullableText = z
  .string()
  .nullish()
  .transform((v) => v ?? null);

/* -------------------------------------------------------------------------- */
/* relic                                                                       */
/* -------------------------------------------------------------------------- */

export const VERDICTS = ["dormant", "dead", "unclear"] as const;
export const VerdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof VerdictSchema>;

export const AXIS_KEYS = [
  "holder_dispersion",
  "lp_residual",
  "dev_wallet_state",
  "floor_shape",
  "social_afterglow",
] as const;
export const AxisKeySchema = z.enum(AXIS_KEYS);
export type AxisKey = z.infer<typeof AxisKeySchema>;

/** Fallback English labels for axes the API did not return at all. */
export const AXIS_FALLBACK_LABELS: Record<AxisKey, string> = {
  holder_dispersion: "Holder dispersion",
  lp_residual: "LP residual",
  dev_wallet_state: "Dev wallet state",
  floor_shape: "Floor shape",
  social_afterglow: "Social afterglow",
};

export const AxisStatusSchema = z.enum(["ok", "unknown"]);
export type AxisStatus = z.infer<typeof AxisStatusSchema>;

export const AxisSchema = z.object({
  key: AxisKeySchema,
  label: z.string(),
  blurb: nullableText,
  /** 0-100, or null when `status` is "unknown". Never folded to 0. */
  score: z.number().min(0).max(100).nullable(),
  weight: z.number().min(0),
  contribution: z.number().nullish().transform((v) => v ?? null),
  status: AxisStatusSchema,
  detail: z.unknown().optional(),
});
export type Axis = z.infer<typeof AxisSchema>;

export const TagSeveritySchema = z.enum(["info", "caution", "alert"]);
export type TagSeverity = z.infer<typeof TagSeveritySchema>;

export const TagConfidenceSchema = z.enum(["high", "medium", "low"]);
export type TagConfidence = z.infer<typeof TagConfidenceSchema>;

export const TagSchema = z.object({
  key: z.string(),
  label: z.string(),
  severity: TagSeveritySchema,
  observed: z.boolean(),
  confidence: TagConfidenceSchema,
  evidence: z.unknown().optional(),
});
export type Tag = z.infer<typeof TagSchema>;

export const SourceRefSchema = z.object({
  name: z.string(),
  endpoint: nullableText,
  fetched_at: nullableTimestamp,
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const CacheInfoSchema = z.object({
  hit: z.boolean(),
  age_s: z.number(),
});
export type CacheInfo = z.infer<typeof CacheInfoSchema>;

/**
 * Contract default. Substituted only when the API omits `disclaimer`, so that
 * every rendered surface has the sentence available.
 */
export const DEFAULT_DISCLAIMER =
  "Survival-signal summary, not a prediction of price or revival.";

export const RelicSchema = z.object({
  mint: z.string(),
  symbol: nullableText,
  name: nullableText,
  /** null when not a single axis could be observed. Not 0. */
  score: z.number().min(0).max(100).nullable(),
  verdict: VerdictSchema,
  axes: z.array(AxisSchema),
  tags: z.array(TagSchema).default([]),
  graduated_at: nullableTimestamp,
  scored_at: nullableTimestamp,
  cache: CacheInfoSchema.nullish().transform((v) => v ?? null),
  sources: z.array(SourceRefSchema).default([]),
  disclaimer: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim().length > 0 ? v : DEFAULT_DISCLAIMER)),
});
export type Relic = z.infer<typeof RelicSchema>;

export const RelicTagsSchema = z.object({
  mint: z.string(),
  tags: z.array(TagSchema).default([]),
});
export type RelicTags = z.infer<typeof RelicTagsSchema>;

/* -------------------------------------------------------------------------- */
/* stall                                                                       */
/* -------------------------------------------------------------------------- */

export const StallSortSchema = z.enum(["record", "recent", "listings"]);
export type StallSort = z.infer<typeof StallSortSchema>;

/**
 * Wins and losses are both required. There is deliberately no `win_rate`
 * field: a rate alone lets a stall hide its losses behind a denominator.
 */
export const StallSchema = z.object({
  owner: z.string(),
  pubkey: z.string(),
  bond_amount: amount,
  opened_at: nullableTimestamp,
  listings_count: z.number().int().min(0),
  resolved_wins: z.number().int().min(0),
  resolved_losses: z.number().int().min(0),
  resolved_pending: z.number().int().min(0),
  slashed: z.boolean(),
  uri: nullableText,
});
export type Stall = z.infer<typeof StallSchema>;

export const StallListSchema = z.object({
  stalls: z.array(StallSchema),
  next_cursor: nullableText,
});
export type StallList = z.infer<typeof StallListSchema>;

export const StallListingSchema = z.object({
  mint: z.string(),
  relic_score_at_listing: z.number().min(0).max(100).nullish().transform((v) => v ?? null),
  thesis: nullableText,
  /** Free-form on the wire ("win" | "loss" | "pending" | null). */
  outcome: nullableText,
  listed_at: nullableTimestamp,
  resolved_at: nullableTimestamp,
});
export type StallListing = z.infer<typeof StallListingSchema>;

export const StallDetailSchema = StallSchema.extend({
  listings: z.array(StallListingSchema).default([]),
});
export type StallDetail = z.infer<typeof StallDetailSchema>;

/* -------------------------------------------------------------------------- */
/* crate                                                                       */
/* -------------------------------------------------------------------------- */

export const CrateComponentSchema = z.object({
  mint: z.string(),
  weight_bps: z.number().int().min(0).max(10_000),
  relic_score: z.number().min(0).max(100).nullish().transform((v) => v ?? null),
});
export type CrateComponent = z.infer<typeof CrateComponentSchema>;

export const CrateSchema = z.object({
  id: z.number().int(),
  creator: z.string(),
  name: z.string(),
  components: z.array(CrateComponentSchema).default([]),
  created_at: nullableTimestamp,
  last_rebalanced_at: nullableTimestamp,
  rebalance_count: z.number().int().min(0),
  frozen: z.boolean(),
});
export type Crate = z.infer<typeof CrateSchema>;

export interface CrateList {
  crates: Crate[];
  next_cursor: string | null;
}

/**
 * `GET /crate` is the one endpoint the contract leaves ambiguous (it shows a
 * single object only), so both a bare array and an envelope are accepted and
 * normalised to one shape.
 */
export const CrateListSchema = z
  .union([
    z.array(CrateSchema),
    z.object({
      crates: z.array(CrateSchema),
      next_cursor: nullableText,
    }),
  ])
  .transform((v): CrateList =>
    Array.isArray(v) ? { crates: v, next_cursor: null } : { crates: v.crates, next_cursor: v.next_cursor },
  );

/* -------------------------------------------------------------------------- */
/* haggle                                                                      */
/* -------------------------------------------------------------------------- */

export const HaggleQuoteRequestSchema = z.object({
  input_mint: z.string().min(1),
  output_mint: z.string().min(1),
  amount: z.union([z.string(), z.number(), z.bigint()]).transform((v) => String(v)),
  slippage_bps: z.number().int().min(0).max(10_000).optional(),
});
export type HaggleQuoteRequest = z.input<typeof HaggleQuoteRequestSchema>;

export const RouteHopSchema = z.object({
  amm: z.string(),
  in_mint: z.string(),
  out_mint: z.string(),
  fee_bps: z.number().nullish().transform((v) => v ?? null),
});
export type RouteHop = z.infer<typeof RouteHopSchema>;

export const HaggleQuoteSchema = z.object({
  in_amount: amount,
  out_amount: amount,
  price_impact_bps: z.number(),
  min_out: amount,
  route: z.array(RouteHopSchema).default([]),
  /** What the service actually used underneath. Stated plainly, never hidden. */
  source: z.string(),
  warning: nullableText,
});
export type HaggleQuote = z.infer<typeof HaggleQuoteSchema>;

/* -------------------------------------------------------------------------- */
/* market / health                                                             */
/* -------------------------------------------------------------------------- */

const optionalCount = z.number().nullish().transform((v) => v ?? null);

export const MarketStatsSchema = z.object({
  relics_scored: optionalCount,
  stalls: optionalCount,
  aftermarket_volume_usd: optionalCount,
  crates_live: optionalCount,
  anchor_version: nullableText,
  /** Chain the scored tokens are read from. Says nothing about the program. */
  data_cluster: nullableText,
  /**
   * Chain the Anchor program is deployed on.
   *
   * Optional, and optional in the strict sense: with no deployment the service
   * omits the key rather than sending `null`, because there is no cluster to
   * name. That is why this is not `nullableText` like the field above -- a
   * `?? null` transform would turn "absent" into a present value, and the next
   * step after a present value is a caller filling it in from `data_cluster`.
   * That substitution is the whole reason the single `cluster` field was split:
   * it advertised a devnet program as running on mainnet.
   */
  program_cluster: z.string().optional(),
});
export type MarketStats = z.infer<typeof MarketStatsSchema>;

export const HealthSchema = z.object({
  status: z.string(),
  version: nullableText,
  uptime_s: z.number().nullish().transform((v) => v ?? null),
});
export type Health = z.infer<typeof HealthSchema>;

export const HealthComponentSchema = z.object({
  status: z.string(),
  last_success_at: nullableTimestamp,
  detail: z.unknown().optional(),
});
export type HealthComponent = z.infer<typeof HealthComponentSchema>;

/** Shape is intentionally loose: the contract only fixes the spirit here. */
export const HealthDetailedSchema = z.object({
  status: z.string(),
  version: nullableText,
  uptime_s: z.number().nullish().transform((v) => v ?? null),
  components: z.record(z.string(), HealthComponentSchema).nullish().transform((v) => v ?? {}),
});
export type HealthDetailed = z.infer<typeof HealthDetailedSchema>;

/**
 * Score aggregation -- implements `docs/relic-spec.md` section 8 exactly.
 * That specification lives in the main repository:
 * https://github.com/BazrMarket/bazr/blob/main/docs/relic-spec.md
 *
 * ```
 * available = { a in axes : a.score != unknown }
 * W_avail   = SUM W_a over available
 * if W_avail == 0 -> { score: null, verdict: "unclear", reason: "no observable axis" }
 * relic     = SUM (W_a * a.score) over available / W_avail
 * a.contribution = available ? (W_a / W_avail) * a.score : 0
 * verification:  SUM a.contribution == relic
 * relic = round(relic)
 * ```
 *
 * The one rule that matters: an unobservable axis is *removed from the
 * denominator*, never folded in as a 0. Folding it in would render every token
 * whose data lookup failed as dead, which is a different claim than "we could
 * not observe this". The two events must not collapse into one number.
 *
 * The weights themselves are not defined here. They arrive on every `Axis` as
 * `weight`, straight from the service, which is the only place relic-spec
 * section 7 is allowed to live. Hard-coding them in the SDK would create a
 * second source of truth that drifts silently.
 */

import { AXIS_FALLBACK_LABELS, AXIS_KEYS } from "./schemas.js";
import type { Axis, AxisKey, AxisStatus, Relic } from "./schemas.js";

export interface AxisContribution {
  key: AxisKey;
  label: string;
  status: AxisStatus;
  /** 0-100 as reported, or null when the axis was not observable. */
  score: number | null;
  /** W_a -- the pre-normalisation weight the service sent. */
  weight: number;
  /** W_a / W_avail. `0` for an unobservable axis. */
  normalizedWeight: number;
  /** relic-spec section 8: `(W_a / W_avail) * score` when available, else `0`. */
  contribution: number;
  /** contribution / relic, 0..1. `0` when relic is 0. */
  share: number;
}

export interface NormalizedScore {
  /** Weighted mean over observable axes, unrounded. `null` when W_avail is 0. */
  score: number | null;
  /** relic-spec section 8 `relic`: {@link score} rounded. `null` stays `null`. */
  scoreRounded: number | null;
  /**
   * relic-spec section 8 emits `verdict: "unclear"` for the W_avail == 0 case.
   * `null` otherwise -- the verdict for a scorable token is the service's call
   * (relic-spec section 9), not this helper's.
   */
  verdict: "unclear" | null;
  /** Why the score is null, when it is. */
  reason: string | null;
  /** Axes that carried a usable score. */
  observed: AxisKey[];
  /** Axes present in the payload with `status: "unknown"`. */
  unknown: AxisKey[];
  /** Canonical axes absent from the payload entirely. */
  missing: AxisKey[];
  /** W_avail -- summed weight of the observable axes. */
  availableWeight: number;
  /** Summed weight of every axis present in the payload. */
  totalWeight: number;
  /** availableWeight / totalWeight, 0..1. */
  weightCoverage: number;
  /** Every axis present in the payload, in contract order, with its section 8 contribution. */
  contributions: AxisContribution[];
}

/**
 * An axis counts only when the service says it is observable *and* sent a
 * number. relic-spec section 8 derives `status` from availability, so the two
 * conditions are the same statement; checking both keeps a malformed payload
 * from producing `NaN`.
 */
export function isAxisObservable(axis: Axis): axis is Axis & { score: number } {
  return axis.status === "ok" && typeof axis.score === "number";
}

function orderedByContract(axes: readonly Axis[]): Axis[] {
  const rank = new Map<string, number>(AXIS_KEYS.map((key, i) => [key, i]));
  return [...axes].sort(
    (a, b) => (rank.get(a.key) ?? AXIS_KEYS.length) - (rank.get(b.key) ?? AXIS_KEYS.length),
  );
}

function emptyResult(
  axes: readonly Axis[],
  observed: AxisKey[],
  unknown: AxisKey[],
  missing: AxisKey[],
  totalWeight: number,
  reason: string,
): NormalizedScore {
  return {
    score: null,
    scoreRounded: null,
    verdict: "unclear",
    reason,
    observed,
    unknown,
    missing,
    availableWeight: 0,
    totalWeight,
    weightCoverage: 0,
    contributions: orderedByContract(axes).map((axis) => ({
      key: axis.key,
      label: axis.label || AXIS_FALLBACK_LABELS[axis.key],
      status: axis.status,
      score: isAxisObservable(axis) ? axis.score : null,
      weight: axis.weight,
      normalizedWeight: 0,
      contribution: 0,
      share: 0,
    })),
  };
}

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

/**
 * @example
 * // 3 of 5 axes observable -> the score is the weighted mean of those 3 over
 * // their own summed weight, not a mean that counts the other 2 as zero.
 * normalizedScore(relic.axes).score
 */
export function normalizedScore(axes: readonly Axis[]): NormalizedScore {
  const present = new Set<AxisKey>();
  const observed: AxisKey[] = [];
  const unknown: AxisKey[] = [];
  let totalWeight = 0;
  let availableWeight = 0;

  for (const axis of axes) {
    present.add(axis.key);
    totalWeight += axis.weight;
    if (isAxisObservable(axis)) {
      observed.push(axis.key);
      availableWeight += axis.weight;
    } else {
      unknown.push(axis.key);
    }
  }

  const missing = AXIS_KEYS.filter((key) => !present.has(key));

  if (observed.length === 0) {
    return emptyResult(axes, observed, unknown, missing, totalWeight, "no observable axis");
  }
  if (availableWeight <= 0) {
    // Not a case relic-spec anticipates: the weights are fixed positive
    // constants there. A service that sends zeroes is broken, and inventing an
    // equal-weight mean would hide that behind a plausible number.
    return emptyResult(
      axes,
      observed,
      unknown,
      missing,
      totalWeight,
      "observable axes carry zero weight",
    );
  }

  const score = axes.reduce(
    (sum, axis) => (isAxisObservable(axis) ? sum + axis.weight * axis.score : sum),
    0,
  ) / availableWeight;

  const contributions: AxisContribution[] = orderedByContract(axes).map((axis) => {
    const available = isAxisObservable(axis);
    const normalizedWeight = available ? axis.weight / availableWeight : 0;
    const contribution = available ? normalizedWeight * axis.score : 0;
    return {
      key: axis.key,
      label: axis.label || AXIS_FALLBACK_LABELS[axis.key],
      status: axis.status,
      score: available ? axis.score : null,
      weight: axis.weight,
      normalizedWeight,
      contribution,
      share: score > 0 ? contribution / score : 0,
    };
  });

  return {
    score,
    scoreRounded: Math.round(score),
    verdict: null,
    reason: null,
    observed,
    unknown,
    missing,
    availableWeight,
    totalWeight,
    weightCoverage: totalWeight > 0 ? availableWeight / totalWeight : 0,
    contributions,
  };
}

export interface AxisRow {
  key: AxisKey;
  label: string;
  blurb: string | null;
  /** null means "not observed", which is not the same as a score of 0. */
  score: number | null;
  weight: number;
  /**
   * Re-normalised contribution, or `null` when the axis was not observable.
   *
   * This is the *rendering* view and deliberately differs from relic-spec
   * section 8, which defines the numeric contribution of an unobservable axis
   * as `0` so that the contributions sum to the score. Printing that `0` in a
   * table is the exact confusion the spec's "unknown is not zero" rule exists
   * to prevent, so the renderer gets `null` here and the section 8 numbers live
   * on {@link NormalizedScore.contributions}.
   */
  contribution: number | null;
  /** Contribution the service itself reported, when it sent one. */
  reportedContribution: number | null;
  status: AxisStatus;
  /** True when the payload had no entry for this axis at all. */
  absent: boolean;
  detail: unknown;
}

/**
 * All five canonical axes in contract order, whatever the payload contained.
 * Axes the service skipped come back as `status: "unknown"`, never as 0.
 */
export function axisRows(axes: readonly Axis[]): AxisRow[] {
  const normalized = normalizedScore(axes);
  const byKey = new Map<AxisKey, Axis>();
  for (const axis of axes) byKey.set(axis.key, axis);
  const contributionByKey = new Map<AxisKey, number>();
  for (const c of normalized.contributions) contributionByKey.set(c.key, c.contribution);

  return AXIS_KEYS.map((key): AxisRow => {
    const axis = byKey.get(key);
    if (!axis) {
      return {
        key,
        label: AXIS_FALLBACK_LABELS[key],
        blurb: null,
        score: null,
        weight: 0,
        contribution: null,
        reportedContribution: null,
        status: "unknown",
        absent: true,
        detail: undefined,
      };
    }
    const observable = isAxisObservable(axis);
    return {
      key,
      label: axis.label || AXIS_FALLBACK_LABELS[key],
      blurb: axis.blurb,
      score: observable ? axis.score : null,
      weight: axis.weight,
      contribution: observable ? (contributionByKey.get(key) ?? null) : null,
      reportedContribution: axis.contribution,
      status: axis.status,
      absent: false,
      detail: axis.detail,
    };
  });
}

/** `normalizedScore(relic.axes)`, spelled out for the common case. */
export function relicScoreBreakdown(relic: Relic): NormalizedScore {
  return normalizedScore(relic.axes);
}

/**
 * How much of the picture was actually observed, e.g. "3 of 5 axes observed".
 * Rendering surfaces should show this next to any score.
 */
export function describeCoverage(normalized: NormalizedScore): string {
  const total = normalized.observed.length + normalized.unknown.length + normalized.missing.length;
  return `${normalized.observed.length} of ${total || AXIS_KEYS.length} axes observed`;
}

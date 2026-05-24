import { describe, expect, it } from "vitest";
import { AXIS_KEYS, axisRows, describeCoverage, normalizedScore } from "../src/index.js";
import type { Axis, AxisKey } from "../src/index.js";
import { WORKED_EXAMPLE, relicPayload, workedExampleAxes } from "./helpers/fixtures.js";
import { AxisSchema, RelicSchema } from "../src/schemas.js";

const contractAxes = (): Axis[] => RelicSchema.parse(relicPayload()).axes;
const workedAxes = (): Axis[] => workedExampleAxes().map((a) => AxisSchema.parse(a));

const byKey = (axes: Axis[], key: AxisKey): Axis => {
  const found = axes.find((a) => a.key === key);
  if (!found) throw new Error(`missing axis ${key}`);
  return found;
};

/**
 * Fixture axes, carrying the relic-spec section 7 weights:
 *   lp_residual       0.30 / 30        floor_shape      0.25 / 55
 *   holder_dispersion 0.20 / 62        dev_wallet_state 0.15 / unknown
 *   social_afterglow  0.10 / unknown
 * W_avail = 0.75, weighted sum = 35.15, relic = 35.15 / 0.75 = 46.8667 -> 47.
 * Folding the unknown axes in as 0 would give 35.15 / 1.00 = 35.15 -- the bug
 * these tests exist to hold down.
 */
describe("normalizedScore -- relic-spec section 8 aggregation", () => {
  it("drops unknown axes and re-normalises over W_avail", () => {
    const result = normalizedScore(contractAxes());

    expect(result.availableWeight).toBeCloseTo(0.75, 9);
    expect(result.totalWeight).toBeCloseTo(1.0, 9);
    expect(result.score).toBeCloseTo(46.8667, 3);
    expect(result.scoreRounded).toBe(47);
    expect(result.observed).toEqual(["holder_dispersion", "lp_residual", "floor_shape"]);
    expect(result.unknown).toEqual(["dev_wallet_state", "social_afterglow"]);
    expect(result.missing).toEqual([]);
    expect(result.weightCoverage).toBeCloseTo(0.75, 9);
    expect(result.verdict).toBeNull();
  });

  it("never folds an unknown axis into a 0 score", () => {
    const axes = contractAxes();
    const result = normalizedScore(axes);
    const zeroFolded =
      axes.reduce((sum, a) => sum + a.weight * (a.score ?? 0), 0) /
      axes.reduce((sum, a) => sum + a.weight, 0);

    expect(zeroFolded).toBeCloseTo(35.15, 6);
    expect(result.score).not.toBeCloseTo(zeroFolded, 3);
    expect(result.score as number).toBeGreaterThan(zeroFolded);
  });

  it("the rounded score matches the score the service reported", () => {
    const relic = RelicSchema.parse(relicPayload());
    expect(normalizedScore(relic.axes).scoreRounded).toBe(relic.score);
  });

  it("returns null with verdict unclear -- not 0 -- when every axis is unknown", () => {
    const axes = contractAxes().map((a): Axis => ({ ...a, score: null, status: "unknown" }));
    const result = normalizedScore(axes);

    expect(result.score).toBeNull();
    expect(result.scoreRounded).toBeNull();
    expect(result.verdict).toBe("unclear");
    expect(result.reason).toBe("no observable axis");
    expect(result.observed).toEqual([]);
    expect(result.unknown).toHaveLength(5);
    expect(result.availableWeight).toBe(0);
    expect(result.weightCoverage).toBe(0);
    expect(result.contributions.every((c) => c.contribution === 0)).toBe(true);
  });

  it("treats status ok with a null score as unobservable rather than as 0", () => {
    const axes = contractAxes().map((a): Axis =>
      a.key === "holder_dispersion" ? { ...a, score: null, status: "ok" } : a,
    );
    const result = normalizedScore(axes);

    expect(result.observed).not.toContain("holder_dispersion");
    expect(result.unknown).toContain("holder_dispersion");
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it("returns null rather than inventing a mean when W_avail is zero", () => {
    const axes = contractAxes().map((a): Axis => ({ ...a, weight: 0 }));
    const result = normalizedScore(axes);

    expect(result.score).toBeNull();
    expect(result.verdict).toBe("unclear");
    expect(result.reason).toBe("observable axes carry zero weight");
  });

  it("counts a single observable axis honestly instead of inventing the rest", () => {
    const axes = contractAxes().map((a): Axis =>
      a.key === "holder_dispersion" ? a : { ...a, score: null, status: "unknown" },
    );
    const result = normalizedScore(axes);

    expect(result.score).toBeCloseTo(62, 9);
    expect(result.availableWeight).toBeCloseTo(0.2, 9);
    expect(describeCoverage(result)).toBe("1 of 5 axes observed");
  });
});

describe("normalizedScore -- relic-spec section 8 verification identity", () => {
  it("SUM contribution == relic across all five axes, unobservable ones included", () => {
    const result = normalizedScore(contractAxes());
    const total = result.contributions.reduce((s, c) => s + c.contribution, 0);

    expect(result.contributions).toHaveLength(5);
    expect(total).toBeCloseTo(result.score as number, 9);
  });

  it("an unobservable axis contributes exactly 0 and carries no normalised weight", () => {
    const result = normalizedScore(contractAxes());
    const dev = result.contributions.find((c) => c.key === "dev_wallet_state");

    expect(dev?.status).toBe("unknown");
    expect(dev?.score).toBeNull();
    expect(dev?.weight).toBeCloseTo(0.15, 9);
    expect(dev?.normalizedWeight).toBe(0);
    expect(dev?.contribution).toBe(0);
  });

  it("normalised weights over the available axes sum to 1 and shares sum to 1", () => {
    const result = normalizedScore(contractAxes());

    expect(result.contributions.reduce((s, c) => s + c.normalizedWeight, 0)).toBeCloseTo(1, 9);
    expect(result.contributions.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 9);
  });

  it("holds the identity for the worked example too", () => {
    const result = normalizedScore(workedAxes());
    const total = result.contributions.reduce((s, c) => s + c.contribution, 0);

    expect(total).toBeCloseTo(result.score as number, 9);
  });

  it("holds the identity when four of five axes are unobservable", () => {
    const axes = contractAxes().map((a): Axis =>
      a.key === "lp_residual" ? a : { ...a, score: null, status: "unknown" },
    );
    const result = normalizedScore(axes);
    const total = result.contributions.reduce((s, c) => s + c.contribution, 0);

    expect(total).toBeCloseTo(result.score as number, 9);
    expect(result.score).toBeCloseTo(30, 9);
  });
});

/** docs/relic-spec.md section 10, reproduced number for number. */
describe("normalizedScore -- relic-spec section 10 worked example (golden)", () => {
  it("reproduces relic = 50.45 -> 50 with W_avail = 1.00", () => {
    const result = normalizedScore(workedAxes());

    expect(result.availableWeight).toBeCloseTo(1.0, 9);
    expect(result.score).toBeCloseTo(WORKED_EXAMPLE.relic, 9);
    expect(result.scoreRounded).toBe(WORKED_EXAMPLE.relicRounded);
    expect(result.unknown).toEqual([]);
    expect(describeCoverage(result)).toBe("5 of 5 axes observed");
  });

  it("reproduces every per-axis contribution from the spec", () => {
    const result = normalizedScore(workedAxes());
    const actual = Object.fromEntries(result.contributions.map((c) => [c.key, c.contribution]));

    for (const [key, expected] of Object.entries(WORKED_EXAMPLE.contributions)) {
      expect(actual[key]).toBeCloseTo(expected, 9);
    }
  });

  it("the spec's contribution list sums to the spec's relic", () => {
    const sum = Object.values(WORKED_EXAMPLE.contributions).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(WORKED_EXAMPLE.relic, 9);
  });
});

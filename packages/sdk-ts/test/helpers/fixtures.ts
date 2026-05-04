/**
 * Payloads shaped exactly like docs/api-contract.md, carrying the axis weights
 * that docs/relic-spec.md section 7 fixes as canonical:
 *
 *   lp_residual 0.30 / floor_shape 0.25 / holder_dispersion 0.20
 *   dev_wallet_state 0.15 / social_afterglow 0.10        (sum 1.00)
 *
 * With two axes unobservable, W_avail = 0.30 + 0.25 + 0.20 = 0.75 and
 * relic = (0.30*30 + 0.25*55 + 0.20*62) / 0.75 = 35.15 / 0.75 = 46.8667 -> 47,
 * which is the score the api-contract example reports.
 */

export const RELIC_MINT = "So11111111111111111111111111111111111111112";

export function relicPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mint: RELIC_MINT,
    symbol: "EXAMPLE",
    name: "Example",
    score: 47,
    verdict: "unclear",
    axes: [
      {
        key: "holder_dispersion",
        label: "Holder dispersion",
        blurb: "How spread out the remaining holders are, excluding CEX and LP wallets.",
        score: 62,
        weight: 0.2,
        contribution: 16.53,
        status: "ok",
        detail: { holders: 812 },
      },
      {
        key: "lp_residual",
        label: "LP residual",
        blurb: "How much liquidity is still parked in the pool.",
        score: 30,
        weight: 0.3,
        contribution: 12,
        status: "ok",
        detail: { lp_usd: 4210 },
      },
      {
        key: "dev_wallet_state",
        label: "Dev wallet state",
        blurb: "What the deployer wallet has done since graduation.",
        score: null,
        weight: 0.15,
        contribution: 0,
        status: "unknown",
        detail: {},
      },
      {
        key: "floor_shape",
        label: "Floor shape",
        blurb: "Shape of the price floor over the last 90 days.",
        score: 55,
        weight: 0.25,
        contribution: 18.33,
        status: "ok",
        detail: {},
      },
      {
        key: "social_afterglow",
        label: "Social afterglow",
        blurb: "Residual chatter after the launch window closed.",
        score: null,
        weight: 0.1,
        contribution: 0,
        status: "unknown",
        detail: {},
      },
    ],
    tags: [
      {
        key: "lp-burned",
        label: "LP burned",
        severity: "info",
        observed: true,
        confidence: "high",
        evidence: { signature: "5xTest" },
      },
      {
        key: "bundle-trace",
        label: "Bundle trace",
        severity: "alert",
        observed: true,
        confidence: "medium",
        evidence: { wallets: 7 },
      },
    ],
    graduated_at: "2025-11-02T10:11:12Z",
    scored_at: "2026-03-19T07:00:00Z",
    cache: { hit: true, age_s: 120 },
    sources: [{ name: "helius", endpoint: "getTokenAccounts", fetched_at: "2026-03-19T07:00:00Z" }],
    disclaimer: "Survival-signal summary, not a prediction of price or revival.",
    ...overrides,
  };
}

export function stallListPayload(): Record<string, unknown> {
  return {
    stalls: [
      {
        owner: "Curat0r1111111111111111111111111111111111111",
        pubkey: "StallPDA111111111111111111111111111111111111",
        bond_amount: "1000000000",
        opened_at: "2026-02-01T00:00:00Z",
        listings_count: 24,
        resolved_wins: 9,
        resolved_losses: 11,
        resolved_pending: 4,
        slashed: false,
        uri: "https://example.invalid/stall.json",
      },
      {
        owner: "Curat0r2222222222222222222222222222222222222",
        pubkey: "StallPDA222222222222222222222222222222222222",
        bond_amount: "250000000",
        opened_at: "2026-02-14T00:00:00Z",
        listings_count: 6,
        resolved_wins: 1,
        resolved_losses: 5,
        resolved_pending: 0,
        slashed: true,
        uri: null,
      },
    ],
    next_cursor: null,
  };
}

export function cratePayload(): Record<string, unknown> {
  return {
    id: 3,
    creator: "Curat0r1111111111111111111111111111111111111",
    name: "Q4 2025 survivors",
    components: [
      { mint: RELIC_MINT, weight_bps: 2500, relic_score: 51 },
      { mint: "MintB1111111111111111111111111111111111111", weight_bps: 7500, relic_score: null },
    ],
    created_at: "2026-01-04T00:00:00Z",
    last_rebalanced_at: "2026-03-01T00:00:00Z",
    rebalance_count: 2,
    frozen: false,
  };
}

export function haggleQuotePayload(): Record<string, unknown> {
  return {
    in_amount: "1000000",
    out_amount: "412300000",
    price_impact_bps: 340,
    min_out: "408177000",
    route: [
      { amm: "Raydium CLMM", in_mint: RELIC_MINT, out_mint: "MintB111", fee_bps: 25 },
    ],
    source: "jupiter",
    warning: "Thin liquidity: price impact above 3%.",
  };
}

/**
 * The worked example from docs/relic-spec.md section 10, reproduced exactly.
 * Every axis is observable, so W_avail = 1.00 and each contribution is simply
 * `W_a * score`:
 *
 *   relic = .30*57 + .25*18 + .20*62 + .15*97 + .10*19
 *         = 17.1 + 4.5 + 12.4 + 14.55 + 1.9 = 50.45 -> 50
 */
export const WORKED_EXAMPLE = {
  relic: 50.45,
  relicRounded: 50,
  verdict: "unclear" as const,
  contributions: {
    lp_residual: 17.1,
    floor_shape: 4.5,
    holder_dispersion: 12.4,
    dev_wallet_state: 14.55,
    social_afterglow: 1.9,
  },
};

export function workedExampleAxes(): Array<Record<string, unknown>> {
  const axis = (key: string, label: string, score: number, weight: number) => ({
    key,
    label,
    blurb: null,
    score,
    weight,
    contribution: Number((weight * score).toFixed(4)),
    status: "ok",
    detail: {},
  });
  return [
    axis("holder_dispersion", "Holder dispersion", 62, 0.2),
    axis("lp_residual", "LP residual", 57, 0.3),
    axis("dev_wallet_state", "Dev wallet state", 97, 0.15),
    axis("floor_shape", "Floor shape", 18, 0.25),
    axis("social_afterglow", "Social afterglow", 19, 0.1),
  ];
}

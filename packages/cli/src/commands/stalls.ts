import { DEFAULT_DISCLAIMER } from "@bazr/sdk";
import type { Stall, StallSort } from "@bazr/sdk";
import { renderTable } from "../ui/table.js";
import type { Column } from "../ui/table.js";
import { resolveWidth } from "../ui/box.js";
import { formatFlag, groupDigits, shortenAddress } from "../ui/format.js";
import type { CliContext } from "../context.js";
import { note, printDisclaimer, printJson, printLines } from "../context.js";

export interface StallsOptions {
  sort: StallSort | undefined;
  limit: number | undefined;
  cursor: string | undefined;
}

/**
 * Wins and losses get the same column treatment: same alignment, same width
 * rules, always both present. There is deliberately no win-rate column -- a
 * single ratio lets a bad record hide behind its denominator.
 */
export async function stallsCommand(ctx: CliContext, opts: StallsOptions): Promise<number> {
  const list = await ctx.client.listStalls({
    ...(opts.sort === undefined ? {} : { sort: opts.sort }),
    ...(opts.limit === undefined ? {} : { limit: opts.limit }),
    ...(opts.cursor === undefined ? {} : { cursor: opts.cursor }),
  });

  if (ctx.json) {
    printJson(ctx, list);
    return 0;
  }

  const { theme } = ctx;
  const total = resolveWidth(ctx.width);

  ctx.out(theme.heading("STALLS"));
  note(ctx, `sorted by ${opts.sort ?? "record"} -- ${list.stalls.length} shown`);
  ctx.out("");

  if (list.stalls.length === 0) {
    note(ctx, "no stalls open yet");
    printDisclaimer(ctx, DEFAULT_DISCLAIMER);
    return 0;
  }

  const columns: Array<Column<Stall>> = [
    { header: "OWNER", value: (s) => shortenAddress(s.owner, 5), flex: true, minWidth: 10 },
    { header: "LISTED", align: "right", value: (s) => String(s.listings_count) },
    {
      header: "WINS",
      align: "right",
      value: (s) => String(s.resolved_wins),
      paint: (_s, t) => t.good,
    },
    {
      header: "LOSSES",
      align: "right",
      value: (s) => String(s.resolved_losses),
      paint: (_s, t) => t.bad,
    },
    { header: "PENDING", align: "right", value: (s) => String(s.resolved_pending) },
    { header: "BOND", align: "right", value: (s) => groupDigits(s.bond_amount) },
    {
      header: "SLASHED",
      value: (s) => formatFlag(s.slashed),
      paint: (s, t) => (s.slashed ? t.bad : t.dim),
    },
  ];
  printLines(ctx, renderTable(list.stalls, columns, theme, total));

  const wins = list.stalls.reduce((n, s) => n + s.resolved_wins, 0);
  const losses = list.stalls.reduce((n, s) => n + s.resolved_losses, 0);
  const pending = list.stalls.reduce((n, s) => n + s.resolved_pending, 0);
  ctx.out("");
  note(ctx, `totals: ${wins} wins, ${losses} losses, ${pending} pending`);
  note(ctx, "Wins and losses are raw counts. No win-rate column is derived from them.");
  note(ctx, "BOND is in raw base units as reported by the chain.");

  if (list.next_cursor) {
    note(ctx, `more: --cursor ${list.next_cursor}`);
  }

  printDisclaimer(ctx, DEFAULT_DISCLAIMER);
  return 0;
}

export async function stallCommand(ctx: CliContext, owner: string): Promise<number> {
  const stall = await ctx.client.getStall(owner);

  if (ctx.json) {
    printJson(ctx, stall);
    return 0;
  }

  const { theme } = ctx;
  const total = resolveWidth(ctx.width);

  ctx.out(theme.heading("STALL"));
  ctx.out(`      ${stall.owner}`);
  note(
    ctx,
    `${stall.listings_count} listed -- ${stall.resolved_wins} wins,` +
      ` ${stall.resolved_losses} losses, ${stall.resolved_pending} pending` +
      `${stall.slashed ? " -- BOND SLASHED" : ""}`,
  );
  ctx.out("");

  if (stall.listings.length === 0) {
    note(ctx, "nothing on the table right now");
  } else {
    const columns: Array<Column<(typeof stall.listings)[number]>> = [
      { header: "MINT", value: (l) => shortenAddress(l.mint, 5) },
      {
        header: "SCORE",
        align: "right",
        value: (l) => (l.relic_score_at_listing === null ? "--" : String(l.relic_score_at_listing)),
      },
      {
        header: "OUTCOME",
        value: (l) => l.outcome ?? "pending",
        paint: (l, t) =>
          l.outcome === "win" ? t.good : l.outcome === "loss" ? t.bad : t.dim,
      },
      { header: "THESIS", value: (l) => l.thesis ?? "", flex: true, minWidth: 12 },
    ];
    printLines(ctx, renderTable(stall.listings, columns, theme, total));
  }

  printDisclaimer(ctx, DEFAULT_DISCLAIMER);
  return 0;
}

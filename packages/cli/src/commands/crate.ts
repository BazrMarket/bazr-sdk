import { DEFAULT_DISCLAIMER } from "@bazr/sdk";
import type { Crate } from "@bazr/sdk";
import { TagBox, resolveWidth } from "../ui/box.js";
import { renderTable } from "../ui/table.js";
import type { Column } from "../ui/table.js";
import { seg } from "../ui/segments.js";
import { formatDate, formatFlag, formatRatio, formatScore, shortenAddress } from "../ui/format.js";
import type { CliContext } from "../context.js";
import { note, printDisclaimer, printJson, printLines } from "../context.js";

export async function crateListCommand(
  ctx: CliContext,
  opts: { limit: number | undefined; cursor: string | undefined },
): Promise<number> {
  const list = await ctx.client.listCrates({
    ...(opts.limit === undefined ? {} : { limit: opts.limit }),
    ...(opts.cursor === undefined ? {} : { cursor: opts.cursor }),
  });

  if (ctx.json) {
    printJson(ctx, list);
    return 0;
  }

  const { theme } = ctx;
  const total = resolveWidth(ctx.width);

  ctx.out(theme.heading("CRATES"));
  note(ctx, `${list.crates.length} shown`);
  ctx.out("");

  if (list.crates.length === 0) {
    note(ctx, "no crates assembled yet");
    printDisclaimer(ctx, DEFAULT_DISCLAIMER);
    return 0;
  }

  const columns: Array<Column<Crate>> = [
    { header: "ID", align: "right", value: (c) => String(c.id) },
    { header: "NAME", value: (c) => c.name, flex: true, minWidth: 10 },
    { header: "PARTS", align: "right", value: (c) => String(c.components.length) },
    {
      header: "REBALANCED",
      align: "right",
      value: (c) => String(c.rebalance_count),
    },
    { header: "LAST", value: (c) => formatDate(c.last_rebalanced_at) },
    {
      header: "FROZEN",
      value: (c) => formatFlag(c.frozen),
      paint: (c, t) => (c.frozen ? t.warn : t.dim),
    },
  ];
  printLines(ctx, renderTable(list.crates, columns, theme, total));

  if (list.next_cursor) {
    ctx.out("");
    note(ctx, `more: --cursor ${list.next_cursor}`);
  }

  printDisclaimer(ctx, DEFAULT_DISCLAIMER);
  return 0;
}

export async function crateShowCommand(ctx: CliContext, id: string): Promise<number> {
  const crate = await ctx.client.getCrate(id);

  if (ctx.json) {
    printJson(ctx, crate);
    return 0;
  }

  const { theme } = ctx;
  const total = resolveWidth(ctx.width);

  const box = new TagBox(total, theme);
  box.top("CRATE");
  box.text(crate.name, theme.bold);
  box.divider();
  box.field("ID", [seg(String(crate.id))]);
  box.field("CREATOR", [seg(crate.creator, theme.dim)]);
  box.field("CREATED", [seg(formatDate(crate.created_at))]);
  box.field("REBALANCED", [
    seg(`${crate.rebalance_count} time(s)`),
    seg(`  last ${formatDate(crate.last_rebalanced_at)}`, theme.dim),
  ]);
  box.field("FROZEN", [seg(formatFlag(crate.frozen), crate.frozen ? theme.warn : theme.dim)]);
  box.bottom();
  printLines(ctx, box.toLines());

  ctx.out("");
  ctx.out(theme.heading("COMPONENTS"));

  if (crate.components.length === 0) {
    note(ctx, "empty crate");
  } else {
    const columns: Array<Column<(typeof crate.components)[number]>> = [
      { header: "MINT", value: (c) => shortenAddress(c.mint, 6), flex: true, minWidth: 12 },
      { header: "WEIGHT", align: "right", value: (c) => formatRatio(c.weight_bps / 10_000, 2) },
      { header: "RELIC", align: "right", value: (c) => formatScore(c.relic_score) },
    ];
    printLines(ctx, renderTable(crate.components, columns, theme, total));

    const sum = crate.components.reduce((s, c) => s + c.weight_bps, 0);
    const unscored = crate.components.filter((c) => c.relic_score === null).length;
    ctx.out("");
    note(ctx, `weights sum to ${formatRatio(sum / 10_000, 2)}`);
    if (unscored > 0) {
      note(ctx, `${unscored} component(s) have no relic score yet; shown as -- not as 0.`);
    }
  }

  printDisclaimer(ctx, DEFAULT_DISCLAIMER);
  return 0;
}

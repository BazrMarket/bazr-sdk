import { DEFAULT_DISCLAIMER } from "@bazr/sdk";
import type { Tag } from "@bazr/sdk";
import { renderTable } from "../ui/table.js";
import type { Column } from "../ui/table.js";
import { resolveWidth } from "../ui/box.js";
import type { CliContext } from "../context.js";
import { note, printDisclaimer, printJson, printLines } from "../context.js";

/** Labels only. Rug and bundle traces are printed exactly as the API reports them. */
export async function tagsCommand(ctx: CliContext, mint: string): Promise<number> {
  const result = await ctx.client.getTags(mint);

  if (ctx.json) {
    printJson(ctx, result);
    return 0;
  }

  const { theme } = ctx;
  const total = resolveWidth(ctx.width);

  ctx.out(theme.heading("TAGS"));
  note(ctx, result.mint);
  ctx.out("");

  if (result.tags.length === 0) {
    note(ctx, "no labels recorded for this mint");
    printDisclaimer(ctx, DEFAULT_DISCLAIMER);
    return 0;
  }

  const columns: Array<Column<Tag>> = [
    {
      header: "SEVERITY",
      value: (t) => t.severity.toUpperCase(),
      paint: (t, th) => (t.severity === "alert" ? th.bad : t.severity === "caution" ? th.warn : th.dim),
    },
    { header: "CONFIDENCE", value: (t) => t.confidence },
    { header: "OBSERVED", value: (t) => (t.observed ? "O" : "X") },
    { header: "KEY", value: (t) => t.key },
    { header: "LABEL", value: (t) => t.label, flex: true, minWidth: 10 },
  ];
  printLines(ctx, renderTable(result.tags, columns, theme, total));

  ctx.out("");
  note(
    ctx,
    "CONFIDENCE is the label's own reliability. A low-confidence alert is still shown.",
  );

  printDisclaimer(ctx, DEFAULT_DISCLAIMER);
  return 0;
}

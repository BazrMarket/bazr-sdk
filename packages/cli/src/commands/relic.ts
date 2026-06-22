import { axisRows, describeCoverage, normalizedScore } from "@bazr/sdk";
import type { Relic, Tag } from "@bazr/sdk";
import { TagBox, meter, resolveWidth, wrap } from "../ui/box.js";
import { renderTable } from "../ui/table.js";
import type { Column } from "../ui/table.js";
import { seg } from "../ui/segments.js";
import {
  formatDate,
  formatRatio,
  formatScore,
  formatScoreFine,
  formatTimestamp,
} from "../ui/format.js";
import type { CliContext } from "../context.js";
import { note, printDisclaimer, printJson, printLines, warnNote } from "../context.js";
import type { Theme } from "../ui/theme.js";

export interface RelicOptions {
  refresh: boolean;
}

function verdictPaint(verdict: string, theme: Theme): (s: string) => string {
  if (verdict === "dead") return theme.bad;
  if (verdict === "dormant") return theme.warn;
  return theme.dim;
}

function scorePaint(score: number | null, theme: Theme): (s: string) => string {
  if (score === null) return theme.dim;
  if (score >= 60) return theme.good;
  if (score >= 35) return theme.warn;
  return theme.bad;
}

function severityPaint(tag: Tag, theme: Theme): (s: string) => string {
  if (tag.severity === "alert") return theme.bad;
  if (tag.severity === "caution") return theme.warn;
  return theme.dim;
}

export async function relicCommand(
  ctx: CliContext,
  mint: string,
  opts: RelicOptions,
): Promise<number> {
  const relic = await ctx.client.getRelic(mint, { refresh: opts.refresh });

  if (ctx.json) {
    printJson(ctx, relic);
    return 0;
  }

  renderRelic(ctx, relic);
  return 0;
}

export function renderRelic(ctx: CliContext, relic: Relic): void {
  const { theme } = ctx;
  const total = resolveWidth(ctx.width);
  const normalized = normalizedScore(relic.axes);
  const rows = axisRows(relic.axes);

  const box = new TagBox(total, theme);
  box.top("RELIC TAG");
  box.text(relic.symbol ?? relic.name ?? "unknown token", theme.bold);
  if (relic.name && relic.name !== relic.symbol) box.text(relic.name, theme.dim);
  // The full mint is printed, never abbreviated -- it is what you paste back.
  box.text(relic.mint, theme.dim);
  box.divider();

  box.field("SCORE", [
    seg(`${formatScore(relic.score)} / 100`, scorePaint(relic.score, theme)),
    seg("  "),
    seg(meter(relic.score), theme.dim),
  ]);
  box.field("VERDICT", [seg(relic.verdict, verdictPaint(relic.verdict, theme))]);
  box.field("OBSERVED", [
    seg(describeCoverage(normalized)),
    seg(`  (${formatRatio(normalized.weightCoverage)} of the weight)`, theme.dim),
  ]);
  box.field("GRADUATED", [seg(formatDate(relic.graduated_at))]);
  box.field("SCORED", [
    seg(formatTimestamp(relic.scored_at)),
    seg(
      relic.cache === null
        ? ""
        : `  cache ${relic.cache.hit ? "hit" : "miss"}, age ${Math.round(relic.cache.age_s)}s`,
      theme.dim,
    ),
  ]);
  box.bottom();
  printLines(ctx, box.toLines());

  ctx.out("");
  ctx.out(theme.heading("AXIS BREAKDOWN"));

  const columns: Array<Column<(typeof rows)[number]>> = [
    { header: "AXIS", value: (r) => r.label, flex: true, minWidth: 12 },
    { header: "SCORE", align: "right", value: (r) => formatScore(r.score) },
    { header: "WEIGHT", align: "right", value: (r) => formatRatio(r.weight) },
    {
      header: "SHARE",
      align: "right",
      value: (r) => {
        if (r.status !== "ok" || r.contribution === null) return "excluded";
        const c = normalized.contributions.find((x) => x.key === r.key);
        return c ? formatRatio(c.normalizedWeight) : "excluded";
      },
    },
    {
      header: "CONTRIB",
      align: "right",
      value: (r) => (r.contribution === null ? "no data" : formatScoreFine(r.contribution)),
    },
    {
      header: "METER",
      value: (r) => meter(r.score),
      paint: (r, t) => (r.score === null ? t.dim : scorePaint(r.score, t)),
    },
  ];
  printLines(ctx, renderTable(rows, columns, theme, total));

  if (normalized.unknown.length > 0 || normalized.missing.length > 0) {
    const count = normalized.unknown.length + normalized.missing.length;
    note(
      ctx,
      `${count} of 5 axes could not be observed. They are excluded from the weighting and` +
        " re-normalised out, not counted as zero.",
    );
  }
  if (normalized.reason !== null) {
    warnNote(ctx, `No score could be computed from these axes: ${normalized.reason}.`);
  }

  // relic-spec section 8 verification identity, printed so a mismatch between
  // the breakdown and the headline score is visible instead of hidden.
  const sum = normalized.contributions.reduce((s, c) => s + c.contribution, 0);
  note(
    ctx,
    `Contributions sum to ${formatScoreFine(normalized.score === null ? null : sum)};` +
      ` the API reported ${formatScore(relic.score)}.`,
  );

  ctx.out("");
  ctx.out(theme.heading("TAGS"));
  if (relic.tags.length === 0) {
    note(ctx, "none recorded");
  } else {
    const tagColumns: Array<Column<Tag>> = [
      {
        header: "SEVERITY",
        value: (t) => t.severity.toUpperCase(),
        paint: (t, th) => severityPaint(t, th),
      },
      { header: "CONFIDENCE", value: (t) => t.confidence },
      { header: "OBSERVED", value: (t) => (t.observed ? "O" : "X") },
      { header: "LABEL", value: (t) => t.label, flex: true, minWidth: 10 },
    ];
    printLines(ctx, renderTable(relic.tags, tagColumns, theme, total));
  }

  if (relic.sources.length > 0) {
    ctx.out("");
    const listed = relic.sources
      .map((s) => (s.endpoint ? `${s.name} (${s.endpoint})` : s.name))
      .join(", ");
    const [first, ...more] = wrap(listed, Math.max(20, total - 9));
    ctx.out(theme.dim(`SOURCES  ${first ?? ""}`));
    for (const line of more) ctx.out(theme.dim(`         ${line}`));
  }

  printDisclaimer(ctx, relic.disclaimer);
}

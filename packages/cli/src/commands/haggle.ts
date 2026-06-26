import { DEFAULT_DISCLAIMER } from "@bazr/sdk";
import type { HaggleQuote } from "@bazr/sdk";
import { TagBox, resolveWidth } from "../ui/box.js";
import { renderTable } from "../ui/table.js";
import type { Column } from "../ui/table.js";
import { padLeft, seg } from "../ui/segments.js";
import { formatBps, groupDigits, shortenAddress } from "../ui/format.js";
import type { CliContext } from "../context.js";
import { note, printDisclaimer, printJson, printLines } from "../context.js";

/** Above this the quote gets a loud block, not a footnote. */
export const IMPACT_WARN_BPS = 300;
/** Above this the block says so in the strongest terms the CLI has. */
export const IMPACT_SEVERE_BPS = 1_000;

export interface HaggleOptions {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number | undefined;
}

export async function haggleCommand(ctx: CliContext, opts: HaggleOptions): Promise<number> {
  const quote = await ctx.client.quoteHaggle({
    input_mint: opts.inputMint,
    output_mint: opts.outputMint,
    amount: opts.amount,
    ...(opts.slippageBps === undefined ? {} : { slippage_bps: opts.slippageBps }),
  });

  if (ctx.json) {
    printJson(ctx, quote);
    return 0;
  }

  renderQuote(ctx, quote, opts);
  return 0;
}

export function renderQuote(ctx: CliContext, quote: HaggleQuote, opts: HaggleOptions): void {
  const { theme } = ctx;
  const total = resolveWidth(ctx.width);
  const severe = quote.price_impact_bps >= IMPACT_SEVERE_BPS;
  const high = quote.price_impact_bps >= IMPACT_WARN_BPS;
  const impactPaint = severe ? theme.bad : high ? theme.warn : theme.good;

  const amounts = [quote.in_amount, quote.out_amount, quote.min_out].map(groupDigits);
  const amountWidth = Math.max(...amounts.map((a) => a.length));
  const [inAmount, outAmount, minOut] = amounts.map((a) => padLeft(a, amountWidth));

  const box = new TagBox(total, theme);
  box.top("HAGGLE QUOTE");
  box.field("IN", [
    seg(inAmount ?? ""),
    seg(`  ${shortenAddress(opts.inputMint, 6)}`, theme.dim),
  ]);
  box.field("OUT", [
    seg(outAmount ?? ""),
    seg(`  ${shortenAddress(opts.outputMint, 6)}`, theme.dim),
  ]);
  box.field("MIN OUT", [
    seg(minOut ?? ""),
    seg(
      opts.slippageBps === undefined ? "" : `  at ${formatBps(opts.slippageBps)} slippage`,
      theme.dim,
    ),
  ]);
  box.field("IMPACT", [seg(formatBps(quote.price_impact_bps), impactPaint)]);
  box.field("SOURCE", [seg(quote.source, theme.dim)]);
  box.bottom();
  printLines(ctx, box.toLines());

  if (high) {
    const warnBox = new TagBox(total, theme);
    const paint = severe ? theme.bad : theme.warn;
    warnBox.top(severe ? "WARNING -- VERY THIN LIQUIDITY" : "WARNING -- THIN LIQUIDITY");
    warnBox.paragraph(
      `Price impact is ${formatBps(quote.price_impact_bps)}. A trade this size moves the` +
        " pool against you before it fills.",
      paint,
    );
    warnBox.blank();
    warnBox.paragraph(
      "Split the size, widen the slippage deliberately, or walk away. This is a route" +
        " simulation over existing liquidity; nothing has been executed.",
      theme.dim,
    );
    warnBox.bottom();
    ctx.out("");
    printLines(ctx, warnBox.toLines());
  }

  if (quote.warning) {
    ctx.out("");
    ctx.out(theme.warn(`WARNING  ${quote.warning}`));
  }

  ctx.out("");
  ctx.out(ctx.theme.heading("ROUTE"));
  if (quote.route.length === 0) {
    note(ctx, "the service returned no route hops");
  } else {
    const hops = quote.route.map((hop, i) => ({ ...hop, index: i + 1 }));
    const columns: Array<Column<(typeof hops)[number]>> = [
      { header: "HOP", align: "right", value: (h) => String(h.index) },
      { header: "AMM", value: (h) => h.amm, flex: true, minWidth: 10 },
      { header: "IN", value: (h) => shortenAddress(h.in_mint, 5) },
      { header: "OUT", value: (h) => shortenAddress(h.out_mint, 5) },
      {
        header: "FEE",
        align: "right",
        value: (h) => (h.fee_bps === null ? "--" : formatBps(h.fee_bps)),
      },
    ];
    printLines(ctx, renderTable(hops, columns, theme, total));
  }

  ctx.out("");
  note(
    ctx,
    "Amounts are raw base units. BAZR runs no order book and no AMM of its own;" +
      ` this route came from ${quote.source}.`,
  );

  printDisclaimer(ctx, DEFAULT_DISCLAIMER);
}

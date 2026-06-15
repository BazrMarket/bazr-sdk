/** Value formatting shared by every command. */

/** A missing score prints as `--`. It is never printed as 0. */
export function formatScore(value: number | null): string {
  return value === null ? "--" : String(Math.round(value));
}

export function formatScoreFine(value: number | null, digits = 1): string {
  return value === null ? "--" : value.toFixed(digits);
}

/** Basis points as a percentage: 340 -> "3.40%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** 0.7 -> "70%". */
export function formatRatio(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** Groups a raw base-unit integer string: "1000000" -> "1,000,000". */
export function groupDigits(value: string): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  if (!/^\d+$/.test(digits)) return value;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

/** Wallet and stall addresses may be shortened; a queried mint never is. */
export function shortenAddress(value: string, keep = 4): string {
  if (value.length <= keep * 2 + 3) return value;
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

export function formatTimestamp(value: string | null): string {
  if (value === null) return "unknown";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

export function formatDate(value: string | null): string {
  if (value === null) return "unknown";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function formatCount(value: number | null): string {
  return value === null ? "--" : groupDigits(String(Math.round(value)));
}

export function formatUsd(value: number | null): string {
  if (value === null) return "--";
  return `$${groupDigits(Math.round(value).toString())}`;
}

/** Yes/no as words, never as a glyph. */
export function formatFlag(value: boolean): string {
  return value ? "YES" : "no";
}

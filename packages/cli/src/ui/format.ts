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

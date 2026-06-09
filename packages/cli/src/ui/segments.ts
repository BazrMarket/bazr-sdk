/**
 * Padding has to be measured on the uncoloured text, otherwise ANSI escapes
 * count towards the column width and every box comes out ragged.
 */

export interface Seg {
  text: string;
  paint?: ((s: string) => string) | undefined;
}

export function seg(text: string, paint?: (s: string) => string): Seg {
  return { text, paint };
}

export function width(segs: readonly Seg[]): number {
  let n = 0;
  for (const s of segs) n += s.text.length;
  return n;
}

export function render(segs: readonly Seg[]): string {
  let out = "";
  for (const s of segs) out += s.paint ? s.paint(s.text) : s.text;
  return out;
}

/** Pads (or truncates) to exactly `to` visible characters. */
export function fit(segs: readonly Seg[], to: number): Seg[] {
  const current = width(segs);
  if (current === to) return [...segs];
  if (current < to) return [...segs, seg(" ".repeat(to - current))];

  const out: Seg[] = [];
  let remaining = to;
  for (const s of segs) {
    if (remaining <= 0) break;
    if (s.text.length <= remaining) {
      out.push(s);
      remaining -= s.text.length;
    } else {
      out.push(seg(s.text.slice(0, Math.max(0, remaining - 3)) + "...", s.paint));
      remaining = 0;
    }
  }
  return fit(out, to);
}

export function padLeft(text: string, to: number): string {
  return text.length >= to ? text : " ".repeat(to - text.length) + text;
}

export function padRight(text: string, to: number): string {
  return text.length >= to ? text : text + " ".repeat(to - text.length);
}

/** A very small flag parser. No dependency, no surprises. */

export type FlagType = "boolean" | "string" | "number";

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | number | boolean>;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const ALIASES: Record<string, string> = { h: "help", v: "version", j: "json" };

export function parseArgs(argv: readonly string[], spec: Record<string, FlagType>): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | number | boolean> = {};
  let onlyPositionals = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;

    if (onlyPositionals) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      onlyPositionals = true;
      continue;
    }
    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      continue;
    }

    const isLong = token.startsWith("--");
    const raw = isLong ? token.slice(2) : token.slice(1);
    const eq = raw.indexOf("=");
    let name = eq >= 0 ? raw.slice(0, eq) : raw;
    let inlineValue: string | null = eq >= 0 ? raw.slice(eq + 1) : null;

    if (!isLong) name = ALIASES[name] ?? name;

    const type = spec[name];
    if (type === undefined) {
      throw new UsageError(`Unknown option "${token}"`);
    }

    if (type === "boolean") {
      if (inlineValue !== null) {
        flags[name] = inlineValue !== "false" && inlineValue !== "0";
      } else {
        flags[name] = true;
      }
      continue;
    }

    if (inlineValue === null) {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith("--") && next.length > 2)) {
        throw new UsageError(`Option "--${name}" needs a value`);
      }
      inlineValue = next;
      i += 1;
    }

    if (type === "number") {
      const parsed = Number(inlineValue);
      if (!Number.isFinite(parsed)) {
        throw new UsageError(`Option "--${name}" needs a number (got "${inlineValue}")`);
      }
      flags[name] = parsed;
    } else {
      flags[name] = inlineValue;
    }
  }

  return { positionals, flags };
}

export function flagString(flags: ParsedArgs["flags"], name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

export function flagNumber(flags: ParsedArgs["flags"], name: string): number | undefined {
  const value = flags[name];
  return typeof value === "number" ? value : undefined;
}

export function flagBool(flags: ParsedArgs["flags"], name: string): boolean {
  return flags[name] === true;
}

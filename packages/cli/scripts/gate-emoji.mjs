/**
 * Gate: no emoji, no glyph status markers, anywhere in these packages.
 *
 * This is NOT an honesty gate. It says nothing about marketing language, and it
 * deliberately does not grow a denylist of forbidden words. Two detectors for
 * one rule means two denylists that drift apart, and the weaker one gets
 * believed. The rules on claims and language are in CONTRIBUTING.md and are
 * enforced in review.
 *
 *   usage:  node scripts/gate-emoji.mjs <path> [path...]
 *           node scripts/gate-emoji.mjs --selftest
 *   exit:   0 = PASS (read N files, clean)
 *           1 = FAIL (found glyphs)
 *           2 = SELF-FAIL (read 0 files, or could not read one)
 *
 * `scanned` is counted from the same list that is read, so it cannot drift from
 * what was actually inspected. Not looking and finding nothing otherwise print
 * the same thing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOTS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SELFTEST = process.argv.includes("--selftest");

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git"]);
const SKIP_FILES = /\.(tgz|map|png|jpg|jpeg|gif|ico|woff2?|ttf)$/i;
const SKIP_NAMES = new Set(["package-lock.json"]);

/**
 * The one file that must contain the glyphs it looks for: this detector. Its
 * control group lives here too, and counting a deliberately seeded violation as
 * a violation would make writing a control group a punishment. Matched on the
 * resolved path so the same rule applies to a relative and an absolute root --
 * an exclusion that only matches one spelling is a coverage bug in disguise.
 */
const EXCLUDED = ["cli/scripts/gate-emoji.mjs"];

const GLYPH =
  /\p{Extended_Pictographic}|[←-⇿⌀-⏿☀-➿✓✔✖✗✘️⬀-⯿]/u;

const excluded = [];

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_FILES.test(entry.name) || SKIP_NAMES.has(entry.name)) continue;
      const full = resolve(join(dir, entry.name));
      if (EXCLUDED.some((e) => full.endsWith(e))) {
        excluded.push(full);
        continue;
      }
      out.push(full);
    }
  };
  walk(root);
  return out;
}

if (SELFTEST) {
  // Both halves matter. Firing on seeded glyphs proves the detector works;
  // staying quiet on the real output vocabulary proves it is not a checker that
  // always fails, which would pass the first half on its own.
  const dirty = ["const a = \"✓ done\";", "const b = \"\u{1F680}\";", "const c = \"✗ failed\";"];
  const clean = [
    'const marker = observed ? "O" : "X";',
    'const verdict = ok ? "PASS" : "FAIL";',
    'const meterCell = "[####......]";',
    'const box = "+-[o]-- RELIC TAG ---+";',
    'const missing = "--";',
  ];
  let ok = 0;
  let fail = 0;
  for (const line of dirty) {
    if (GLYPH.test(line)) ok += 1;
    else { fail += 1; console.log(`  selftest MISS (dirty): ${JSON.stringify(line)}`); }
  }
  for (const line of clean) {
    if (!GLYPH.test(line)) ok += 1;
    else { fail += 1; console.log(`  selftest FALSE POSITIVE (clean): ${line}`); }
  }
  console.log(`selftest ok=${ok} fail=${fail} verdict=${fail === 0 ? "PASS" : "FAIL"}`);
  process.exit(fail === 0 ? 0 : 1);
}

if (ROOTS.length === 0) {
  console.log("scanned=0");
  console.log("verdict=SELF-FAIL (no paths given -- nothing was read)");
  process.exit(2);
}

const files = ROOTS.flatMap((r) => (statSync(r).isDirectory() ? listFiles(r) : [resolve(r)]));

let scanned = 0;
let unreadable = 0;
const hits = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    unreadable += 1;
    console.log(`  UNREADABLE ${file}: ${err.message}`);
    continue;
  }
  scanned += 1;
  text.split("\n").forEach((line, i) => {
    const m = line.match(GLYPH);
    if (m) {
      const cp = m[0].codePointAt(0).toString(16).toUpperCase();
      hits.push(`${file}:${i + 1}: ${line.trim()}   <- U+${cp}`);
    }
  });
}

console.log(`scanned=${scanned} excluded=${excluded.length} unreadable=${unreadable}`);
for (const f of excluded) console.log(`  EXCLUDED (declared) ${f}`);
console.log(`hits=${hits.length}`);
for (const h of hits) console.log(`  GLYPH ${h}`);

const verdict = scanned === 0 || unreadable > 0 ? "SELF-FAIL" : hits.length === 0 ? "PASS" : "FAIL";
console.log(`verdict=${verdict}`);
process.exit(verdict === "PASS" ? 0 : verdict === "FAIL" ? 1 : 2);

import { afterEach, describe, expect, it } from "vitest";
import { findClosedPort, startMockServer } from "./helpers/server.js";
import type { MockServer } from "./helpers/server.js";
import {
  RELIC_MINT,
  cratePayload,
  haggleQuotePayload,
  relicPayload,
  stallListPayload,
} from "./helpers/fixtures.js";
import { BANNED_RE, EMOJI_RE, ansiCount, run, stripAnsi } from "./helpers/run.js";

let server: MockServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

describe("usage surface", () => {
  it("--help lists every command and exits 0", async () => {
    const r = await run(["--help"]);

    expect(r.code).toBe(0);
    for (const cmd of ["relic", "tags", "stalls", "crate list", "crate show", "haggle"]) {
      expect(r.out).toContain(cmd);
    }
    expect(r.out).toContain("BAZR_API");
  });

  it("no arguments prints help and exits 2", async () => {
    const r = await run([]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("USAGE");
  });

  it("--version prints the version", async () => {
    const r = await run(["--version"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("an unknown command exits 2 with an X-prefixed line, not a stack trace", async () => {
    const r = await run(["snipe"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('X  Unknown command "snipe"');
    expect(r.err).not.toContain("at Object.");
  });

  it("an unknown option exits 2", async () => {
    const r = await run(["relic", RELIC_MINT, "--turbo"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown option "--turbo"');
  });

  it("haggle without --in exits 2 and says which option is missing", async () => {
    const r = await run(["haggle", "--out", "MintB", "--amount", "1000"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--in <mint>");
  });

  it("haggle rejects a non-integer amount", async () => {
    const r = await run(["haggle", "--in", "A", "--out", "B", "--amount", "1.5"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--amount must be a whole number");
  });

  it("--sort outside the contract enum exits 2", async () => {
    const r = await run(["stalls", "--sort", "trending"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--sort must be one of record, recent, listings");
  });
});

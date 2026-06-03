<!-- bazr-honesty-allow-file: this file enumerates the banned marketing terms on purpose -->

# Contributing

This repository holds two TypeScript packages: `@bazr/sdk` in `packages/sdk-ts`
and `bazr-cli` in `packages/cli`. Both are read-only clients for the BAZR relic
API. Contributions that make the scoring more honest, or that make a failure
louder instead of quieter, are the most welcome kind.

The Anchor program, the relic specification and the API contract live in
[BazrMarket/bazr](https://github.com/BazrMarket/bazr). A change to the scoring
model belongs there first. See [Changing the score](#changing-the-score).

---

## Repository layout

| Path | What it is | State |
| --- | --- | --- |
| `packages/sdk-ts/` | `@bazr/sdk`. Schemas, client, transport, score maths. | Installs, typechecks, builds and tests clean. |
| `packages/cli/` | `bazr-cli`. Terminal renderer built on the SDK. | Installs, typechecks, builds and tests clean. |
| `.github/workflows/ci.yml` | Typecheck, build and test for both packages. | Runs only commands that pass locally. |

Neither package is on the npm registry yet. See
[Publishing](#publishing) at the bottom.

---

## Development environment

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 18 or newer | Both manifests declare `>=18`. CI runs 20. |
| npm | Ships with Node | Lockfiles are committed, so `npm ci` works as well as `npm install`. |

No Rust, no Solana CLI and no Anchor toolchain are needed to work on this
repository. Neither package signs a transaction or holds a key.

---

## The build

Run this from a clean checkout. All six commands pass:

```bash
cd packages/sdk-ts
npm install
npm run typecheck    # tsc --noEmit
npm run build        # tsup -> dist/index.js, dist/index.cjs, dist/index.d.ts
npm test             # vitest run

cd ../cli
npm install
npm run typecheck
npm run build        # tsup -> dist/bazr.js
npm test
```

`packages/cli` picks up `@bazr/sdk` from its committed lockfile as a link to
`../sdk-ts`. There is no separate linking step and no registry involved. If you
ever need to re-establish that link by hand, `npm run dev:link` in
`packages/cli` installs `../sdk-ts` into `node_modules` without touching
`package.json`, so the published manifest keeps the registry range `^0.1.0`
rather than a local `file:` path.

`npm run typecheck` is the check that catches the most. Both packages compile
under `strict` plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax`, so a
plausible-looking change that loses a null check will not get past it.

`npm test` in `packages/cli` rebuilds **both** bundles before it runs. Testing the
shipped binary against a stale `@bazr/sdk/dist` would reintroduce a blind spot
that has already cost this project once.

---

## Tests

- **No live network calls.** Use `test/helpers/server.ts` in either package. A
  test that reaches a real RPC endpoint or the real API will time out on a CI
  runner with no network policy for it, and the failure will look like your
  change broke something.
- **No real secrets in fixtures, and no real wallets.** Synthetic values only,
  including addresses.
- **Some failures are only visible from outside the runner.**
  `packages/cli/test/spawned.test.ts` executes `dist/bazr.js` as a real child
  process. Called in-process, the CLI borrows the test runner's event loop, and a
  command that would strand a bare `node dist/bazr.js` returns normally. That is
  not hypothetical: an awaited backoff timer had been excused from holding the
  process open, `bazr relic` died mid-retry on every cache miss, it exited as
  though nothing were wrong, and every in-process suite stayed green. If you
  touch the transport, the retry loop, or process exit, add a spawned test.
- Score maths, schema parsing and URL construction are pure local computation.
  They need no mocking at all.

---

## Changing the score

**A pull request that changes how a relic score is produced must change
[`docs/relic-spec.md`](https://github.com/BazrMarket/bazr/blob/main/docs/relic-spec.md)
in the main repository first, and must link that change.**

This covers axis weights, axis definitions, verdict thresholds, coverage rules,
and anything that moves a token between `dormant`, `dead` and `unclear`.

The specification is the published claim. The code is the implementation of that
claim. If the code moves and the specification does not, then the published
formula is no longer the formula being run, and the whole reason to trust the
number is gone.

Two rules inside the model are not up for negotiation, so propose changes to them
with a full argument rather than a patch:

1. **An unobserved axis is removed from the weighting denominator and the
   remaining weights are re-normalised. It is never folded in as a zero.**
   Missing data and bad data are different events. Folding an unobserved axis to
   zero makes a token whose lookup failed render identically to a token that was
   measured and found dead.
2. **Low coverage produces the verdict `unclear`, not a low score.** `unclear` is
   a real answer. Padding it into a number that looks complete is the failure
   mode this project exists to avoid.

The SDK does not hold its own copy of the weights. They arrive on every `Axis` as
`weight`, straight from the service. Hard-coding them here would create a second
source of truth that drifts silently, and the drift would be invisible because
both numbers would look plausible.

---


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


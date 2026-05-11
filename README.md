# BAZR SDK and CLI

<p align="center">
<a href="https://bazr.market"><img src="https://img.shields.io/badge/site-bazr.market-1F6FB2?style=flat-square" alt="Site"></a>
<a href="https://api.bazr.market/health"><img src="https://img.shields.io/badge/api-api.bazr.market-7FA650?style=flat-square" alt="API"></a>
<a href="https://github.com/BazrMarket/bazr"><img src="https://img.shields.io/badge/main%20repo-BazrMarket%2Fbazr-3A3A38?style=flat-square&logo=github&logoColor=white" alt="Main repository"></a>
<a href="https://github.com/BazrMarket/bazr-sdk/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/BazrMarket/bazr-sdk/ci.yml?branch=main&label=build&style=flat-square" alt="Build"></a>
<a href="https://github.com/BazrMarket/bazr-sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-C8A87C?style=flat-square" alt="License"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/typescript-5.9-1F6FB2?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
<a href="https://nodejs.org/en/download"><img src="https://img.shields.io/badge/node-%3E%3D18-7FA650?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node"></a>
<a href="https://zod.dev"><img src="https://img.shields.io/badge/zod-4.4-E8452F?style=flat-square" alt="zod"></a>
<a href="https://vitest.dev"><img src="https://img.shields.io/badge/tests-120%20passing-7FA650?style=flat-square&logo=vitest&logoColor=white" alt="Tests"></a>
<a href="https://explorer.solana.com/address/FSLSR2xYiR5NPWg6g8DZ1KyVRVa7xW37gDStbaDfSXLb?cluster=devnet"><img src="https://img.shields.io/badge/solana-devnet%20only-D9B85C?style=flat-square&logo=solana&logoColor=white" alt="Solana devnet"></a>
<a href="https://github.com/BazrMarket/bazr-sdk#status-nothing-here-is-published-to-npm-yet"><img src="https://img.shields.io/badge/registry-not%20published-6E7076?style=flat-square" alt="Registry status"></a>
<a href="https://github.com/BazrMarket/bazr/blob/main/docs/relic-spec.md"><img src="https://img.shields.io/badge/relic%20spec-published-C8A87C?style=flat-square" alt="Relic specification"></a>
</p>

Two TypeScript packages for reading the BAZR relic API: a typed client library
and a terminal client built on top of it.

BAZR is an aftermarket for Solana meme tokens that **already graduated from a
launchpad**. It scores what survived, publishes the formula, and shows the
reasoning behind every number.

**A relic score is a summary of survival signals, not a prediction of price or
revival.** It compresses what could be observed about a token after graduation
into one number and five axes, each of which is shown with its own weight and
its own contribution. There is no trending feed, no new-launch feed, no ranking
of what is about to move, and no sniping surface. Those are deliberate absences,
not gaps waiting to be filled.

---

## What is in this repository

| Package | Name | What it does |
| --- | --- | --- |
| `packages/sdk-ts` | `@bazr/sdk` | Typed client for the relic API. Runtime-validated responses, retry and backoff policy, score re-normalisation maths. |
| `packages/cli` | `bazr-cli` | Terminal client. Renders relic tags, axis breakdowns, stall records, crates and route quotes. Depends on `@bazr/sdk`. |

The Anchor program, the relic specification, the API contract and the sourcing
research live in the main repository, [BazrMarket/bazr](https://github.com/BazrMarket/bazr).
The hosted web frontend and the indexing service are not open source and are not
in either repository.

---

## Status: nothing here is published to npm yet

**Neither `@bazr/sdk` nor `bazr-cli` has been published to the npm registry.**
`npm install @bazr/sdk` and `npm install -g bazr-cli` do not work today and will
fail with `E404`. Both manifests carry `publishConfig.access: public` and are
ready for a release, but the release has not happened.

Until it does, the only supported installation is a build from source, described
in the next section. That build is not a workaround shown for completeness -- it
is the real and only path, and every command in it was executed against this
tree before it was written down.

When the packages are published, the order is fixed: `@bazr/sdk` first, then
`bazr-cli`. The CLI depends on the SDK by registry range (`^0.1.0`), so
publishing the CLI first would upload a package nobody can install, and the
`E404` names the SDK rather than the CLI.

---

## Architecture

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor': '#F2EFE3',
  'primaryTextColor': '#3A3A38',
  'primaryBorderColor': '#1F6FB2',
  'lineColor': '#1F6FB2',
  'secondaryColor': '#C8A87C',
  'tertiaryColor': '#D9B85C',
  'fontFamily': 'monospace'
}}}%%
graph TD
  CLI["bazr-cli<br/>terminal renderer"] --> SDK
  APP["your application<br/>node or browser"] --> SDK
  SDK["@bazr/sdk<br/>createBazrClient"] --> HTTP["transport<br/>timeout, Retry-After, backoff"]
  SDK --> SCORE["score.ts<br/>re-normalise over observed axes"]
  SDK --> ZOD["schemas.ts<br/>zod runtime validation"]
  HTTP --> API["BAZR service<br/>relic, stall, crate, haggle"]
  API --> IDX["indexers and RPC<br/>read-only, off this repo"]
  API --> CHAIN["bazr-market program<br/>Solana devnet"]
  ZOD -->|"contract violation"| ERR["BazrValidationError<br/>thrown, never silently dropped"]
  SCORE -->|"unknown axis"| DEN["removed from the denominator<br/>never folded in as zero"]

  style DEN fill:#E8452F,stroke:#3A3A38,color:#F2EFE3
  style SCORE fill:#C8A87C,stroke:#3A3A38,color:#3A3A38
  style API fill:#1F6FB2,stroke:#3A3A38,color:#F2EFE3
  style CHAIN fill:#D9B85C,stroke:#3A3A38,color:#3A3A38
```

---

## Install from source

Node 18 or newer. Lockfiles are committed for both packages, so the dependency
tree is reproducible.

```bash
git clone https://github.com/BazrMarket/bazr-sdk.git
cd bazr-sdk

cd packages/sdk-ts
npm install
npm run build
npm test

cd ../cli
npm install
npm run build
npm test
```

`packages/cli` resolves `@bazr/sdk` from its committed lockfile as a link to
`../sdk-ts`, so the sibling package is picked up without any extra linking step
and without a registry. The CLI test suite rebuilds both bundles before it runs,
because a spawned-process test against a stale `dist/` measures the wrong thing.

Run the built binary directly, or put `bazr` on your `PATH` with `npm link`:

```bash
node packages/cli/dist/bazr.js --help
node packages/cli/dist/bazr.js health --api https://api.bazr.market

cd packages/cli && npm link    # optional; makes the `bazr` command available
```

That second command answers from the deployed service today:

```
PASS  https://api.bazr.market
      status ok, version 0.1.0
```

---

## Quick start -- SDK

```ts
import { createBazrClient, axisRows, normalizedScore } from "@bazr/sdk";

const bazr = createBazrClient({
  baseUrl: "https://api.bazr.market",
});

const relic = await bazr.getRelic("So11111111111111111111111111111111111111112");

console.log(relic.score, relic.verdict);   // 71 "dormant"
console.log(relic.disclaimer);             // always present in the response

for (const row of axisRows(relic.axes)) {
  // An axis that was not observed comes back with score null.
  // Print "--", never 0. They are different events.
  console.log(row.label, row.score ?? "--", row.contribution ?? "no data");
}

const n = normalizedScore(relic.axes);
console.log(n.observed.length, "of 5 axes observed");
console.log((n.weightCoverage * 100).toFixed(0) + "% of the weight was observable");
```

Every failure throws a typed error rather than resolving to an empty object:
`BazrApiError`, `BazrRateLimitError` (carrying `retryAfterMs`),
`BazrNetworkError`, `BazrTimeoutError`, `BazrValidationError` (carrying the zod
issues) and `BazrConfigError`. Full reference in
[`packages/sdk-ts/README.md`](packages/sdk-ts/README.md).

---


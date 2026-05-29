# @bazr/sdk

Typed client for the BAZR relic API.

BAZR looks at Solana meme tokens **after** they graduated from a launchpad. A relic
score is a summary of survival signals with its inputs shown; it is not a
prediction of price or revival, and there is no endpoint that ranks what is about
to move.

- Runtime-validated responses (zod). A renamed field raises an error instead of
  turning into `undefined`.
- Retries that respect `Retry-After` on 429 and back off exponentially on 5xx.
  4xx throws immediately.
- `status: "unknown"` axes are excluded and the remaining weights re-normalised,
  never folded in as a 0.
- Node 18+ and browsers. Uses the global `fetch`; you can inject your own.

## Install

**This package is not published to the npm registry yet.**
`npm install @bazr/sdk` fails with `E404` today. Build it from source instead:

```bash
git clone https://github.com/BazrMarket/bazr-sdk.git
cd bazr-sdk/packages/sdk-ts
npm install
npm run build
npm test
```

That produces `dist/index.js` (ESM), `dist/index.cjs` (CommonJS) and
`dist/index.d.ts`. To consume it from another project on the same machine before
a release exists, install it by path:

```bash
npm install /path/to/bazr-sdk/packages/sdk-ts
```

The manifest already carries `publishConfig.access: public`, which is what a
scoped package needs in order to be published at all, so the release is a
decision rather than a piece of missing work. It has not been made yet, and this
section will say so until it has.


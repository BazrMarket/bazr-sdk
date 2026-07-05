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

## Usage

```ts
import { createBazrClient, axisRows, normalizedScore } from "@bazr/sdk";

const bazr = createBazrClient({ baseUrl: "http://localhost:8030" });

const relic = await bazr.getRelic("So11111111111111111111111111111111111111112");

console.log(relic.score, relic.verdict);   // 47 "unclear"
console.log(relic.disclaimer);

for (const row of axisRows(relic.axes)) {
  // Unknown axes come back with score null. Print "--", not 0.
  console.log(row.label, row.score ?? "--", row.contribution ?? "no data");
}
```

### Client options

```ts
createBazrClient({
  baseUrl: "http://localhost:8030",
  fetch: myFetch,        // optional; defaults to globalThis.fetch
  timeoutMs: 10_000,     // per attempt; 0 disables
  headers: { "x-trace": "..." },
  userAgent: null,       // browsers forbid setting user-agent
  retry: {
    maxAttempts: 3,      // total attempts including the first
    baseDelayMs: 250,
    maxDelayMs: 8_000,
    maxRetryAfterMs: 30_000,  // a longer Retry-After throws instead of sleeping
    jitter: true,
    retryOnNetworkError: true,
    onRetry: (info) => console.warn(info.reason, info.delayMs),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),  // see below
  },
});
```

`timeoutMs` is per attempt, and the right value depends on the endpoint.
`/health` and `/stall` answer in well under a second; scoring a mint the
service has not seen walks its holder pages first -- measured against
production, `/relic/{mint}` took 28.8s cold and `/relic/{mint}/tags` 47.7s. A
single blanket 10s makes those two impossible to call successfully.

A custom `sleep` must keep the process alive until it settles. Handing in a
timer that has been `unref`'d looks harmless -- it reads as "do not hold the
process open for a backoff" -- but the retry loop *awaits* this promise, and by
then the failed request has released its socket. With nothing else pending,
Node exits mid-wait and the await never settles: the rest of the retry loop and
everything the caller meant to do afterwards are abandoned, with no error
raised and no failing status. Use a plain `setTimeout`, and cancel through
`AbortSignal` if a request needs to be abandoned.

### Methods

| Method | Endpoint |
| --- | --- |
| `getRelic(mint, { refresh })` | `GET /relic/{mint}` |
| `getTags(mint)` | `GET /relic/{mint}/tags` |
| `listStalls({ sort, limit, cursor })` | `GET /stall` |
| `getStall(owner)` | `GET /stall/{owner}` |
| `listCrates({ limit, cursor })` | `GET /crate` |
| `getCrate(id)` | `GET /crate/{id}` |
| `quoteHaggle(req)` | `POST /haggle/quote` |
| `getStats()` | `GET /market/stats` |
| `getHealth()` / `getHealthDetailed()` | `GET /health`, `GET /health/detailed` |

## Unknown axes

A relic score is a weighted mean over five axes. When an axis cannot be observed
the API returns `status: "unknown"` and `score: null`.

`normalizedScore(axes)` drops those axes and re-normalises the weights of the
rest. Folding them in as zeros would make every token with a failed data lookup
render as dead, which is a different claim than "we could not observe this".

```ts
const n = normalizedScore(relic.axes);

n.score;           // weighted mean over observable axes only, or null
n.observed;        // ["holder_dispersion", "lp_residual", "floor_shape"]
n.unknown;         // ["dev_wallet_state", "social_afterglow"]
n.missing;         // canonical axes the payload did not contain at all
n.weightCoverage;  // 0.7 -- how much of the weight was observable
n.contributions;   // per-axis contribution after re-normalisation
```

If not one axis is observable, `score` is `null`. It is never `0`.

## Errors

Every failure throws. Nothing resolves to an empty object.

| Class | When |
| --- | --- |
| `BazrApiError` | The server answered 4xx/5xx. Carries `status`, `code`, `detail`. |
| `BazrRateLimitError` | 429. Carries `retryAfterMs` as parsed from the header. |
| `BazrNetworkError` | The request never reached the server. |
| `BazrTimeoutError` | The attempt outlived `timeoutMs`. |
| `BazrValidationError` | A 2xx body did not match the contract. Carries `issues`. |
| `BazrConfigError` | Bad client configuration or arguments. |

`describeError(err)` returns one line fit for a terminal, and `errorHints(err)`
returns follow-up lines. The `bazr` CLI uses both instead of printing a stack.

```ts
import { describeError, errorHints } from "@bazr/sdk";

try {
  await bazr.getRelic(mint);
} catch (err) {
  console.error(describeError(err));
  for (const hint of errorHints(err)) console.error(`  ${hint}`);
}
```


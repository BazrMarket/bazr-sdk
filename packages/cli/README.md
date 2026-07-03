# bazr-cli

Terminal client for BAZR, the Solana meme aftermarket.

BAZR only looks at tokens that already graduated from a launchpad. A relic score
is a weighted summary of survival signals with every input shown; it is not a
prediction of price or revival. There is no trending feed, no new-launch feed and
no sniping in this tool, by design.

```
+-[o]-- RELIC TAG ----------------------------------------------------------+
| EXAMPLE                                                                   |
| So11111111111111111111111111111111111111112                               |
+---------------------------------------------------------------------------+
| SCORE       47 / 100  [#####.....]                                        |
| VERDICT     unclear                                                       |
| OBSERVED    3 of 5 axes observed  (70% of the weight)                     |
| GRADUATED   2025-11-02                                                    |
| SCORED      2026-03-19 07:00:00Z  cache hit, age 120s                     |
+---------------------------------------------------------------------------+

AXIS BREAKDOWN
AXIS               SCORE  WEIGHT     SHARE  CONTRIB  METER
-----------------  -----  ------  --------  -------  ------------
Holder dispersion     62     25%       36%     22.1  [######....]
LP residual           30     25%       36%     10.7  [###.......]
Dev wallet state      --     20%  excluded  no data  [no data   ]
Floor shape           55     20%       29%     15.7  [######....]
Social afterglow      --     10%  excluded  no data  [no data   ]
```

## Install

**This package is not published to the npm registry yet.**
`npm install -g bazr-cli` and `npx bazr-cli` both fail with `E404` today. Build
it from source instead:

```bash
git clone https://github.com/BazrMarket/bazr-sdk.git
cd bazr-sdk/packages/cli
npm install
npm run build
npm test

node dist/bazr.js --help
```

`npm install` here resolves `@bazr/sdk` from the committed lockfile as a link to
the sibling `../sdk-ts`, so no registry and no separate linking step are
involved. `npm test` builds both bundles before it runs.

To put `bazr` on your `PATH` without a registry:

```bash
cd bazr-sdk/packages/cli && npm link
bazr --help
```


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

### When a release does happen: `@bazr/sdk` first, then `bazr-cli`

`bazr-cli` depends on `@bazr/sdk` by registry range (`^0.1.0`), not by path.
Publishing the CLI first uploads a package nobody can install, and the error
names the SDK rather than the CLI, so it is easy to go looking in the wrong
place:

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@bazr%2fsdk - Not found
npm error 404
npm error 404  '@bazr/sdk@^0.1.0' is not in this registry.
```

So: publish `packages/sdk-ts` first, then `packages/cli`. `@bazr/sdk` is a
scoped package and therefore private by default -- the `publishConfig.access`
of `public` already in its manifest is what makes step one work at all.

## Commands

| Command | What it prints |
| --- | --- |
| `bazr relic <mint>` | Relic tag, five-axis breakdown, labels, sources |
| `bazr tags <mint>` | Labels only |
| `bazr stalls` | Stall ranking with wins and losses side by side |
| `bazr stall <owner>` | One stall and everything on its table |
| `bazr crate list` | Crates currently assembled |
| `bazr crate show <id>` | One crate and its components |
| `bazr haggle` | Route simulation over existing liquidity |
| `bazr stats` | Counters the service reports |
| `bazr health` | Whether the service answers |

```bash
bazr relic So11111111111111111111111111111111111111112
bazr relic <mint> --refresh
bazr stalls --sort record --limit 20
bazr crate show 3
bazr haggle --in <mint> --out <mint> --amount 1000000 --slippage-bps 100
bazr tags <mint> --json
```

## Options

| Option | Meaning |
| --- | --- |
| `--api <url>` | API base URL. Defaults to `$BAZR_API`, then `http://localhost:8030` |
| `--json`, `-j` | Print the validated API response as JSON |
| `--timeout <ms>` | Per-attempt timeout. Default 90000 for `relic` and `tags`, 10000 for everything else |
| `--retries <n>` | Total attempts including the first (default 3) |
| `--color` / `--no-color` | Force colour on or off. Auto-detected otherwise |
| `--debug` | Print the stack trace when something fails |

Colour is switched off automatically when stdout is not a TTY, when `NO_COLOR`
is set, and when `TERM=dumb`. Everything the CLI prints reads correctly with
colour stripped: there are no emoji and no glyph-only status markers, only
words and `O` / `X`.

The timeout default is per endpoint because the endpoints are not comparable.
`/health` and `/stall` answer in well under a second. Scoring a mint the
service has not seen walks its holder pages and asks several upstreams first --
measured against production, `/relic/{mint}` took 28.8s cold and
`/relic/{mint}/tags` 47.7s. A slow request says so on stderr rather than
sitting silent, and so does every retry, so a slow run can be told apart from
a stuck one. Both notices go to stderr; `--json` on stdout stays clean.

## What the output promises

- **An axis that could not be observed prints `--` and `no data`, never `0`.**
  It is excluded from the weighting and the remaining weights are re-normalised.
  The footer states how many axes were observed and how much of the weight that
  covered.
- **The contribution column adds up.** The sum is printed next to the score the
  API reported, so a mismatch is visible rather than hidden.
- **Stall records print wins and losses as separate raw counts.** There is no
  win-rate column: a rate alone lets a bad record hide behind its denominator.
- **Labels are printed as reported, including low-confidence alerts.** Rug and
  bundle traces are not filtered out.
- **`haggle` is a simulation over existing liquidity.** BAZR runs no order book
  and no AMM of its own; the quote names the router it used. High price impact
  gets its own warning block, not a footnote.
- **The API disclaimer is printed on every command.**

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | The request failed (network, HTTP error, contract violation) |
| `2` | Usage error (unknown command or option, missing argument) |
| `70` | bazr stopped before producing a result -- a bug in bazr itself |

`70` exists because the worst failure a CLI can have is one that reports
success. If any promise in the command never settles, Node empties its event
loop and leaves with no output and a status no script would read as a failure.
That shipped once: an awaited backoff timer had been told not to hold the
process open, and `bazr relic` died mid-retry on every cache miss while exiting
as though nothing were wrong. The timer is fixed and covered by tests that run
this binary as a real process; `70` is the guard that makes any future
recurrence loud instead of silent.

Failures print one sentence plus hints, not a stack trace. Add `--debug` when
you want the stack.

```
X  Cannot reach http://localhost:8030/relic/<mint>: fetch failed (ECONNREFUSED)
   Is the BAZR service running and reachable?
   Point the client somewhere else with --api <url> or the BAZR_API env var.
```

## Development

The CLI depends on `@bazr/sdk` from the same repository. The full loop from a
clean checkout, all of which passes:

```bash
cd packages/sdk-ts && npm install && npm run typecheck && npm run build && npm test
cd ../cli        && npm install && npm run typecheck && npm run build && npm test
```

The committed `package-lock.json` records `@bazr/sdk` as a link to `../sdk-ts`,
so a plain `npm install` sets it up. If that link ever needs re-establishing by
hand, `npm run dev:link` installs `../sdk-ts` into `node_modules` without
touching `package.json`, so the manifest keeps the registry range `^0.1.0`
rather than a local `file:` path.

`npm test` builds both packages before it runs. `test/spawned.test.ts` executes
`dist/bazr.js` as a real child process, because that is the only place some
failures are visible: called in-process, the CLI borrows the test runner's
event loop, and a command that would strand a bare `node dist/bazr.js` returns
normally. Every other suite here passed while `bazr relic` printed nothing at
all against the live service. Testing the shipped binary against a stale
`@bazr/sdk/dist` would reintroduce the same blind spot, which is why the build
covers both.

## Gates

A glyph scan guards what this CLI is allowed to render. It ships with the
repository and covers both packages, so anyone can run it at any time.

```bash
# from packages/cli -- glyph scan over sdk-ts and cli
npm run gate:emoji:selftest   # control group. Run this first.
npm run gate:emoji
```

Attach the real output, not a tick:

```
selftest ok=8 fail=0 verdict=PASS

scanned=50 excluded=1 unreadable=0
  EXCLUDED (declared) .../packages/cli/scripts/gate-emoji.mjs
hits=0
verdict=PASS
```

`scanned=` is counted from the same file list the scan reads, so it cannot drift
from what was actually inspected. `scanned=0` is `SELF-FAIL`, not `PASS`: not
looking and finding nothing produce identical output otherwise.

Excluded files are named on every run rather than dropped quietly. They are the
detectors themselves and the test fixtures, which necessarily contain the words
and glyphs being searched for. `gate:emoji:selftest` is the control group: it
checks that the detector fires on seeded violations *and* stays quiet on clean
source, because a check that always fails passes an audit just as easily as one
that always succeeds.


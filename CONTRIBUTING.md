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

## What the renderers are required to show

These are behavioural contracts, not style preferences. A pull request that
removes one will be asked to put it back:

- An axis that could not be observed prints `--` and `no data`, never `0`.
- The observed-axis count and the fraction of the weight it covered are printed
  next to any score.
- The contribution column sums are printed next to the score the API reported, so
  a mismatch is visible rather than hidden.
- Stall records print wins and losses as separate raw counts. There is no
  win-rate column: a rate alone lets a bad record hide behind its denominator.
- Labels are printed as reported, including low-confidence alerts. Rug and bundle
  traces are not filtered out.
- The API disclaimer is printed on every command.

---

## Commit messages

**Write a plain English imperative sentence. No prefix, no colon, no scope.**

This project does not use Conventional Commits. Do not open a message with
`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf` or
`style`. More generally: **the message must not begin with a token followed by a
colon**, in any form, including `word:`, `word(scope):` and `word(scope)!:`.

Capitalise the first word. No trailing period. Roughly 72 characters or fewer.

### Do this

```
Remove unknown axes from the weighting denominator
Honour Retry-After when the API returns 429
Decode base58 fully instead of matching on length
Publish the axis weights alongside the score
Bump zod to 4.4.3
```

### Not this

```
feat: remove unknown axes from the weighting denominator
fix(sdk): honour Retry-After when the API returns 429
chore: bump zod to 4.4.3
sdk: add the crate list endpoint
```

The last one has no Conventional Commits keyword in it and is still wrong. The
banned shape is `token` followed by `:` at the start of the line, whatever the
token is.

Check your own branch before you open a pull request. This should print nothing:

```bash
git log --format=%s origin/main..HEAD | grep -E '^[A-Za-z][A-Za-z0-9_-]*(\([^)]*\))?!?:'
```

---

## No emoji

**No emoji anywhere.** Not in commit messages, not in code, not in comments, not
in documentation, not in pull request titles or descriptions, not in test names,
not in log output, and not in anything the interface renders.

This includes GitHub shortcodes such as `:fire:` and `:rocket:`, and it includes
symbol characters used as status marks. Write `PASS` and `FAIL`, or `O` and `X`.

Reasons, since "house style" is not one:

- Emoji render differently on every platform and some do not render at all.
- They break `grep`, alignment and terminal width maths.
- A score that claims to be an observation should not be decorated like an
  advertisement.

The repository ships the scanner and its control group, so you can check your own
work before CI does:

```bash
cd packages/cli
npm run gate:emoji:selftest    # control group; run this first
npm run gate:emoji
```

The selftest exists because a detector that always fails passes an audit just as
easily as one that always succeeds. It checks that the scanner fires on seeded
violations *and* stays quiet on clean source. `scanned=0` is a self-failure, not
a pass.

---

## Language and claims

- **Everything in this repository is written in English.** Code, comments,
  documentation, commit messages and pull request text.
- **No marketing language about price.** The words `guaranteed`, `100x`, `moon`,
  `gem` and phrases like "next pump" do not belong in a repository whose product
  is a survival measurement. A relic score is an observational summary, not a
  prediction and not financial advice.
- **Do not describe something as working when it does not.** If a command,
  package or deployment does not exist, say so plainly. The README says in its
  own words that nothing here is on npm and that the Anchor program is devnet
  only, because a README that oversells is found in one minute and costs more
  than the missing feature would have.
- **Failures are displayed at the same size as successes.** That applies to stall
  records, to rug and bundle observations, and to this documentation.

---

## Pull requests

One change per pull request. Describe what you changed and how you verified it,
including the commands you ran and their output. "It should work" is not a
verification.

Before you open it:

- [ ] `npm install && npm run typecheck && npm run build && npm test` passes in
      every package you touched
- [ ] Any test you added passes locally and makes no live network calls
- [ ] `npm run gate:emoji:selftest` then `npm run gate:emoji` both print
      `verdict=PASS`, and `scanned` is not `0`
- [ ] Zero emoji, in every file you touched and in the pull request text itself
- [ ] Zero commit messages beginning with a token and a colon
- [ ] Zero secrets: no API keys, no RPC URLs carrying a key, no private keys, no
      `.env` file, no real wallet in a fixture
- [ ] The relic specification in the main repository is updated in the same change
      set, and linked, if you changed how a score or a verdict is produced
- [ ] English only
- [ ] No new claim in the documentation that the code does not support

### Security issues do not go here

Do not open a public pull request or issue for a vulnerability. Report it
privately through GitHub Security Advisories. See [SECURITY.md](SECURITY.md).

A false positive in the scoring model is also a security report, and it belongs
in that same private channel with a full mint address and the observed axis
breakdown.

---


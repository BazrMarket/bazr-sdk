# Security Policy

This repository holds two TypeScript clients for the BAZR relic API: `@bazr/sdk`
in `packages/sdk-ts` and `bazr-cli` in `packages/cli`. BAZR reads public
on-chain and social data, summarises it as a relic score, and shows the reasoning
behind that summary.

This document covers how to report a security problem here, and it also covers
the limits of the score itself, because a score that is trusted for more than it
can carry is a safety problem and not only an accuracy problem.

---

## Supported versions

Every package in this repository is pre-1.0 and is developed on `main`. Security
fixes land on `main`. There are no maintenance branches and no back-ported
patches for earlier commits.

| Component | Path | Version | Receives security fixes |
| --- | --- | --- | --- |
| `@bazr/sdk` | `packages/sdk-ts/` | 0.1.x | Yes |
| `bazr-cli` | `packages/cli/` | 0.1.x | Yes |
| Any earlier commit or fork | - | - | No |

Neither package is published to the npm registry, so there is no released
artefact to pin and no supply-chain surface through npm today. When that changes,
this table gains a published-version column.

---

## Reporting a vulnerability

**Use GitHub Security Advisories. Do not open a public issue.**

Report privately here:

https://github.com/BazrMarket/bazr-sdk/security/advisories/new

That form is the only reporting channel this project maintains. It is private
between you and the maintainers until an advisory is published, and it keeps the
report attached to the repository, so nothing is lost in a personal inbox. No
email address, DM handle or bug bounty platform is listed here on purpose: a
contact that does not exist, or that nobody watches, is worse than no contact at
all.

If GitHub Security Advisories is unavailable to you, open a public issue that
says only "I have a security report and cannot use the advisory form", with no
technical detail, and wait to be contacted.

### What to include

A report is actionable when it lets someone else reproduce it. Please include:

- The affected package and the commit hash or version.
- What an attacker gains, in one sentence.
- Exact reproduction steps. For the SDK, the request and the response payload.
  For the CLI, the exact argument vector and the environment.
- Any proof-of-concept code, as a patch or a script.
- Your assessment of severity, and whether you have disclosed it elsewhere.

Please do not test against other people's wallets, funds or infrastructure.

### What to expect

These are targets, not promises, and they are what the maintainers work to:

| Stage | Target |
| --- | --- |
| Acknowledgement that the report arrived | 3 business days |
| Initial assessment and severity triage | 7 calendar days |
| Fix or documented mitigation for high severity | 30 calendar days |
| Public advisory after a fix ships | Coordinated with the reporter |

### Disclosure

This project follows coordinated disclosure. The default embargo is 90 days from
acknowledgement, shortened when a fix ships earlier and extended when a fix needs
downstream coordination. Reporters are credited in the advisory by whatever name
they choose, and may ask to stay anonymous.

If a report is already being exploited in the wild, say so in the first message.
That changes the schedule.

---

## Scope

### In scope

- **`packages/sdk-ts/`** -- schema validation that can be bypassed so a caller
  receives an unvalidated object; URL or path construction that sends a request
  somewhere the caller did not intend; credentials or headers leaking into error
  messages or logs; retry logic that can be driven into amplification against a
  third party; a response that can strand the caller's process instead of
  resolving or throwing.
- **`packages/cli/`** -- argument or environment handling that leads to command
  execution or file access the user did not ask for; output that misrepresents an
  axis, a coverage figure or a stall record; an exit status that reports success
  after a failure.
- **Scoring correctness that changes a verdict** -- coverage accounting,
  re-normalisation of missing axes, and verdict thresholds. See the section
  below.
- **Supply chain** -- a dependency in this repository with a known advisory, or a
  build script that fetches code at install time.

### Out of scope

- Third-party services this project reads from. Report those to their own
  security programs. This includes Solana RPC providers, Helius, Dexscreener and
  Jupiter.
- The hosted web frontend and the indexing service. They are not in this
  repository.
- The `bazr-market` Anchor program. It lives in
  [BazrMarket/bazr](https://github.com/BazrMarket/bazr) and reports go there.
- Denial of service against public RPC endpoints, and load testing of any kind
  against infrastructure you do not own.
- Market outcomes. A token going to zero is not a vulnerability.
- Automated scanner output with no reproduction and no analysis.
- Social engineering, phishing of maintainers, and physical access.
- Attacks that require the victim to have already lost their private key.
- Missing rate limits on a local development server.

---

## Limits of the relic score

**A relic score is an observational summary, not a financial judgement.** It
compresses what could be observed about a token after graduation into one number
and five axes. It is not a prediction, not a rating, not a recommendation, and
not a statement that a token is safe.

**Do not use a relic score as a reason to buy or sell anything.** It is a starting
point for your own reading of the on-chain data, and the axis breakdown exists so
you can go check the underlying facts yourself rather than trust the number.


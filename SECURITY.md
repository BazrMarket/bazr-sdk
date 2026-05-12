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


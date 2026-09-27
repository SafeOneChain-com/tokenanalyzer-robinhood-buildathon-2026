# TokenAnalyzer × Robinhood Chain — Buildathon 2026

This public repository is the reviewed Robinhood competition slice of TokenAnalyzer. It demonstrates how an asset-verification product can distinguish contract metadata from official identity, keep price evidence sources honest about their limits, and make a result independently reproducible through a compact on-chain evidence commitment.

## What judges can verify

- A contract is identified by **chain ID plus address**, never by ticker or token name.
- All chain access is read-only and restricted to an explicit JSON-RPC allowlist.
- Robinhood reference values, Chainlink oracle evidence, and observed-market evidence remain separate.
- Canonical `TA-EVIDENCE-V1` snapshots produce deterministic hashes and chain-bound asset keys.
- `TokenAnalyzerEvidenceAnchor` stores a minimal immutable commitment on Robinhood Chain Testnet.
- The included AAPL fixture recomputes to the hash already anchored on-chain.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm ci
npm test
npm start
```

Open <http://127.0.0.1:3000>. The AAPL anchor demonstration works offline. For live read-only inspection, copy `.env.example` values into your shell environment and provide your own Robinhood Chain RPC URL. No wallet or private key is needed.

## Verify the contract

```bash
npm --prefix contracts/evidence-anchor ci
npm run contract:compile
npm run contract:test
```

Deployment is intentionally separate and is never part of the normal test or demo commands. The committed deployment helper requires an explicit testnet key in the process environment.

## On-chain result

- Network: Robinhood Chain Testnet (`46630`)
- Evidence Anchor: `0xA0D2f089Cc8d6DC0F5785887b6D646bf3F262455`
- AAPL evidence transaction: `0xbd6d27955a28eb8b1f871767fbd31ddb8a59309be0d5e1d46072da1c3a744da0`
- AAPL evidence hash: `0xfeafca9a653947e528e112711f3a99ee9488cf5d10464b1ab75a98932b179121`

See [architecture](docs/ARCHITECTURE.md), [verified evidence](docs/VERIFIED_EVIDENCE.md), [security boundary](SECURITY.md), and [source provenance](SOURCE_PROVENANCE.md).

## Repository boundary

This is a standalone competition artifact, not the full TokenAnalyzer product or production backend. It contains no private repository history, production configuration, database schema, admin system, deployment credentials, operator logs, or unrelated product code. `EXPORT_MANIFEST.json` provides a hash inventory of every published file.

Public availability does not grant a broad software license. See [license scope](LICENSE_SCOPE.md). The Evidence Anchor Solidity file carries its own MIT SPDX identifier; all other original material is reserved unless a file says otherwise.

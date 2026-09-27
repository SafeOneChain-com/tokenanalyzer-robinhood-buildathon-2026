# TokenAnalyzer × Robinhood Chain — Buildathon 2026

This public repository is the reviewed Robinhood competition slice of TokenAnalyzer. It demonstrates how an asset-verification product can distinguish contract metadata from official identity, keep price evidence sources honest about their limits, and make a result independently reproducible through a compact on-chain evidence commitment.

It is the independently reviewable Robinhood competition slice from TokenAnalyzer, not the complete production system.

## Built for the competition

The Buildathon work added the Robinhood Chain network boundary, bounded read-only EVM inspection, exact official-asset matching, stock-token multiplier and corporate-action checks, source-separated Robinhood and Chainlink price evidence, the versioned canonical evidence format, and the minimal Evidence Anchor contract. The standalone server, offline fixture viewer, export manifest, and public packaging were added solely so judges can reproduce that work without access to the private product repository.

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

Live reads may require server-side RPC credentials from a provider. Providers may offer free quotas, but this project makes no promise about availability, rate limits, or pricing. Tests never call a production RPC or send a transaction.

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

Explorer evidence: [deployed contract](https://explorer.testnet.chain.robinhood.com/address/0xA0D2f089Cc8d6DC0F5785887b6D646bf3F262455), [deployment transaction](https://explorer.testnet.chain.robinhood.com/tx/0x5e13361f1808da296fa0766a70d32554e9db670194633b04310403022fb76d52), and [AAPL anchor transaction](https://explorer.testnet.chain.robinhood.com/tx/0xbd6d27955a28eb8b1f871767fbd31ddb8a59309be0d5e1d46072da1c3a744da0).

## Demo cases and network boundary

- **AAPL mainnet read:** contract `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` demonstrates an exact official contract match and the complete historical evidence fixture.
- **CRM mainnet read:** contract `0xd95B44124e475743a7589e68F3D74008A5536D44` is intentionally presented as a partial-evidence case. Missing evidence stays missing rather than being promoted to a verdict.
- **Mainnet versus Testnet:** asset inspection reads Robinhood Chain Mainnet (`4663`) when explicitly configured. The already-qualified Evidence Anchor is on Robinhood Chain Testnet (`46630`). A mainnet read is not itself an on-chain anchor.

The current evidence contract does not claim that every new analysis is automatically anchored. The included AAPL snapshot is a fixed historical example tied to the published transaction. New snapshots are not submitted by the demo or tests.

Observed AMM market evidence remains unavailable when no qualified venue and pool are configured. Chainlink currently does not publish a Robinhood Chain Sequencer Uptime Feed, so that capability is reported as unavailable and excluded from the current evidence set. Neither gap is filled with a synthetic value.

An anchor proves that the configured attestor committed one exact snapshot hash at a particular time. It does not prove that an asset is safe, that a price is correct, that an oracle is live, or that anyone should trade. This work has not been described as an external security audit.

See [architecture](docs/ARCHITECTURE.md), [verified evidence](docs/VERIFIED_EVIDENCE.md), [security boundary](SECURITY.md), and [source provenance](SOURCE_PROVENANCE.md).

## Repository boundary

This is a standalone competition artifact, not the full TokenAnalyzer product or production backend. It contains no private repository history, production configuration, database schema, admin system, deployment credentials, operator logs, or unrelated product code. `EXPORT_MANIFEST.json` provides a hash inventory of every published file.

Public availability does not grant a broad software license. See [license scope](LICENSE_SCOPE.md). The Evidence Anchor Solidity file carries its own MIT SPDX identifier; all other original material is reserved unless a file says otherwise.

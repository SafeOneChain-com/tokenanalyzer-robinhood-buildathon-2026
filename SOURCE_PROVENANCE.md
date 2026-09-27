# Source provenance and publication boundary

This standalone competition repository was exported from the private TokenAnalyzer V1 repository at source commit `3ded629d66f47f951b79cd3ab5cde36471440f63` on 2026-09-27.

The export includes only the reviewed Robinhood competition slice: read-only EVM clients, exact official-asset matching, stock-token and oracle evidence services, canonical evidence hashing, the `TokenAnalyzerEvidenceAnchor` Solidity workspace, a standalone public demo, controlled fixtures, tests, and jury documentation.

The standalone server, top-level package files, public shell, fixture, export checks, license-scope notice, and repository documentation were added during packaging. They contain no production configuration and do not replace or deploy any production runtime.

Explicitly excluded: private Git history, the full TokenAnalyzer backend, admin and authentication systems, databases and schemas, migrations, production deployment files, operator logs, handoffs, internal coordination records, secrets, environment values, Telegram configuration, and unrelated product code.

`EXPORT_MANIFEST.json` records every published file and SHA-256 digest. It is generated after dependency locks are finalized and is verified before publication.

## Relevant source hashes

| Published file | SHA-256 |
| --- | --- |
| `src/evm/chainRegistry.js` | `71e9b63b8a15580f0173cd9468493411bd36379be712bc5db9582d9b173b88aa` |
| `src/evm/readClient.js` | `1bd67fa30324b62d5a243ee85d9856798422cce066d10ee82a4709d0418a8f86` |
| `src/evm/erc20Reader.js` | `bfd4fb9226fe49cea0acfae7883b5055226654cb9aa704e9efbd050cd6f38cd5` |
| `src/services/robinhoodAssetInspectionService.js` | `0f40e4ba07ea91bf1b0b2cd82841a1b3b59b669319e3d5fd25a2cbb96f303bbf` |
| `src/services/robinhoodOfficialAssetRegistry.js` | `9f2dd7a1262749aea79706b9adf6aa597bed5d3d6464bb3cdd54ac5544b777f3` |
| `src/services/robinhoodStockTokenIntegrityService.js` | `5583d8590c99db87da99285aa8014f8e213a694be8fe72239d85cdffccdac07d` |
| `src/services/robinhoodOracleIntegrityService.js` | `03d74c62db778419412265c6ebc1f29d77a3547745947215dee63012126aae5e` |
| `src/services/robinhoodEvidenceAnchor.js` | `e27ae0180ce7bbdd0f1db22a969468f913cf868560f7009167fac442c1e5c091` |
| `public/robinhood.js` | `7cca6e94075ef947493b6e73117b4ecbd827d696b54baf26a50edd11a10ede72` |
| `contracts/evidence-anchor/contracts/TokenAnalyzerEvidenceAnchor.sol` | `34e1553be751cd9c07fc73b7c2844de9bf3c7e48d1f8e0546b6862cda141f51e` |
| `fixtures/aapl-anchored-snapshot.json` | `c1bcdaa17d46ba148ef8dfb12d8af87342563123c3e691f2c659b834f8cfd3fb` |

The full allowlist and per-file hashes are in `EXPORT_MANIFEST.json`.

## Timeline classification

- **Before the Buildathon:** the private TokenAnalyzer/BEX product, its protected administration and deployment infrastructure, and unrelated product surfaces already existed. Those components remain private and are not copied here.
- **During the Buildathon:** the exported Robinhood network, inspection, official-registry, multiplier, corporate-action, oracle, evidence-canonicalization, UI, contract, fixture, and test files were created or refined as the competition implementation.
- **Publication packaging:** the top-level standalone server, package metadata, public shell, export checks, manifest, license-scope notice, and jury-focused documentation were created for this separate repository. They do not alter the qualified contract, canonicalization rules, historical fixture, or production system.

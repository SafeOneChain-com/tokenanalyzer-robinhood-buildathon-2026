# TokenAnalyzer Evidence Anchor

`TokenAnalyzerEvidenceAnchor` stores a hash, asset key, schema version, timestamp and attestor on Robinhood Chain. It never stores prices, user data, verification payloads, scores, API responses or verdicts.

The workspace is pinned to Hardhat `2.28.0`, Hardhat Toolbox `5.0.0` and Solidity `0.8.30` with optimizer runs `200`. The committed lockfile is required for a reproducible build. Run `npm ci`, `npm run compile`, `npm test`, and `npm run gas` inside this folder.

Testnet-only deployment uses `ROBINHOOD_TESTNET_RPC_URL` and `ROBINHOOD_TESTNET_EVIDENCE_ANCHOR_PRIVATE_KEY`. The configuration accepts a standard private key with or without an initial `0x` only in memory; never place either secret in Git. The configured Testnet network is fixed at chain ID `46630`. Blockscout uses the official Testnet API at `https://explorer.testnet.chain.robinhood.com/api/`.

Qualified Testnet evidence: contract `0xA0D2f089Cc8d6DC0F5785887b6D646bf3F262455`, deployment transaction `0x5e13361f1808da296fa0766a70d32554e9db670194633b04310403022fb76d52`, block `122390120`. The Solidity artifact retains source SHA-256 `34e1553be751cd9c07fc73b7c2844de9bf3c7e48d1f8e0546b6862cda141f51e`, artifact SHA-256 `d4f60c813e577f94f64cf98ef80ab4a4f8fb789eea61262b7adf9dbabb25f237`, and bytecode SHA-256 `7d02e45f6fea94be61100d5fe75d996211aaeaa91875e63a769f33e9dad8ee12`.

The server-side counterpart is `../../src/services/robinhoodEvidenceAnchor.js`. It canonicalizes a snapshot, derives hash and asset key, builds an `anchorEvidence` call, and can read `isAnchored` for later verification.

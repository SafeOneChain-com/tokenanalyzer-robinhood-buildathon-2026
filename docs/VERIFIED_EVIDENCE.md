# Verified competition evidence

| Item | Verified value |
| --- | --- |
| Source baseline | `3ded629d66f47f951b79cd3ab5cde36471440f63` |
| Network | Robinhood Chain Testnet, chain ID `46630` |
| Contract | `0xA0D2f089Cc8d6DC0F5785887b6D646bf3F262455` |
| Deployment transaction | `0x5e13361f1808da296fa0766a70d32554e9db670194633b04310403022fb76d52` |
| Deployment block | `122390120` |
| AAPL evidence hash | `0xfeafca9a653947e528e112711f3a99ee9488cf5d10464b1ab75a98932b179121` |
| AAPL asset key | `0x0192635cb5f077288bc670d95c17c85575d1109d0858ffdcaca3e8096581f70e` |
| AAPL anchor transaction | `0xbd6d27955a28eb8b1f871767fbd31ddb8a59309be0d5e1d46072da1c3a744da0` |
| AAPL anchor block | `122392231` |
| Solidity | `0.8.30`, optimizer 200, EVM target `paris` |
| Deployment gas | `428712` |
| Anchor write gas | `72013` |

The committed fixture reproduces the AAPL evidence hash and asset key without network access. The contract tests cover owner and attestor controls, zero values, duplicate writes, immutable readback, and events.

Hosted product demo: <https://bex.tokenops.io/bex/robinhood-preview.html>

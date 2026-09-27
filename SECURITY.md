# Security and trust boundary

The demo is read-only. It never requests a wallet connection and its application server permits only bounded JSON input and read-only JSON-RPC methods. Mainnet RPC inspection requires both an operator-provided RPC URL and an explicit enable flag.

An Evidence Anchor proves that the configured attestor recorded one exact canonical snapshot hash at a particular time. It does not prove an asset is safe, a price is correct, an oracle is live, or a user should trade. The contract stores no prices, scores, personal data, or full evidence payloads.

Do not commit RPC credentials or private keys. Use local environment variables only. Report security issues privately through the organization contact channel rather than a public issue containing exploit or credential details.

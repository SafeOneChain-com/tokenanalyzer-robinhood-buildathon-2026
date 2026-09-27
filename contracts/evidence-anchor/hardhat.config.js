require('@nomicfoundation/hardhat-toolbox');

const rawDeployerKey = String(process.env.ROBINHOOD_TESTNET_EVIDENCE_ANCHOR_PRIVATE_KEY || '').trim();
const deployerKey = rawDeployerKey && !rawDeployerKey.startsWith('0x') ? `0x${rawDeployerKey}` : rawDeployerKey;

module.exports = {
  solidity: {
    version: '0.8.30',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    robinhoodTestnet: {
      url: String(process.env.ROBINHOOD_TESTNET_RPC_URL || '').trim(),
      chainId: 46630,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
  etherscan: {
    apiKey: { robinhoodTestnet: 'empty' },
    customChains: [{
      network: 'robinhoodTestnet',
      chainId: 46630,
      urls: {
        apiURL: 'https://explorer.testnet.chain.robinhood.com/api/',
        browserURL: 'https://explorer.testnet.chain.robinhood.com/',
      },
    }],
  },
};

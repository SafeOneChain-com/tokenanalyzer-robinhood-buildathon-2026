'use strict';

const NETWORKS = Object.freeze({
  'robinhood-testnet': Object.freeze({
    key: 'robinhood-testnet',
    name: 'Robinhood Chain Testnet',
    chainId: 46630,
    rpcEnv: 'ROBINHOOD_TESTNET_RPC_URL',
    explorerBaseUrl: 'https://explorer.testnet.chain.robinhood.com',
    requiresExplicitEnable: false,
  }),
  'robinhood-mainnet': Object.freeze({
    key: 'robinhood-mainnet',
    name: 'Robinhood Chain Mainnet',
    chainId: 4663,
    rpcEnv: 'ROBINHOOD_MAINNET_RPC_URL',
    explorerBaseUrl: 'https://robinhoodchain.blockscout.com',
    requiresExplicitEnable: true,
    enabledEnv: 'ROBINHOOD_MAINNET_ENABLED',
  }),
});

function isEnabledValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function configuredNetwork(network, env = process.env) {
  const rpcUrl = String(env[network.rpcEnv] || '').trim();
  const explicitlyEnabled = !network.requiresExplicitEnable || isEnabledValue(env[network.enabledEnv]);
  return {
    ...network,
    rpcUrl,
    configured: Boolean(rpcUrl),
    enabled: Boolean(rpcUrl) && explicitlyEnabled,
  };
}

function listRobinhoodNetworks(env = process.env) {
  return Object.values(NETWORKS).map((network) => {
    const resolved = configuredNetwork(network, env);
    return {
      key: resolved.key,
      name: resolved.name,
      chainId: resolved.chainId,
      configured: resolved.configured,
      enabled: resolved.enabled,
      explorerBaseUrl: resolved.explorerBaseUrl,
    };
  });
}

function resolveRobinhoodNetwork(networkKey, env = process.env) {
  const key = String(networkKey || '').trim();
  const network = NETWORKS[key];
  if (!network) {
    const error = new Error('Unknown Robinhood Chain network.');
    error.code = 'UNKNOWN_NETWORK';
    throw error;
  }
  const resolved = configuredNetwork(network, env);
  if (!resolved.enabled) {
    const error = new Error('Robinhood Chain network is not enabled.');
    error.code = 'NETWORK_NOT_ENABLED';
    throw error;
  }
  return resolved;
}

module.exports = { NETWORKS, isEnabledValue, listRobinhoodNetworks, resolveRobinhoodNetwork };

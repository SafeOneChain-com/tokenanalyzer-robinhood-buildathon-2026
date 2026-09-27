'use strict';

const { getAddress, isAddress } = require('viem');

const OFFICIAL_ASSETS_URL = 'https://api.robinhood.com/rhj/assets';
const OFFICIAL_CONTRACTS_REFERENCE_URL = 'https://docs.robinhood.com/chain/contracts/';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 3500;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function normalizeDeployment(deployment) {
  const chainId = Number(deployment?.chainId);
  const address = String(deployment?.contractAddress || '').trim();
  if (!Number.isSafeInteger(chainId) || chainId < 1 || !isAddress(address, { strict: false })) return null;
  return { chainId, address: getAddress(address) };
}

function cleanString(value, { maxLength = 512 } = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function decimalString(value) {
  const cleaned = cleanString(value, { maxLength: 96 });
  return cleaned && /^\d+(?:\.\d+)?$/.test(cleaned) ? cleaned : null;
}

function safeCapabilities(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = ['canTrade', 'canBuy', 'canSell', 'isTradable'];
  const output = {};
  for (const key of allowed) if (typeof value[key] === 'boolean') output[key] = value[key];
  return Object.keys(output).length ? output : null;
}

function normalizeAssets(payload) {
  const assets = Array.isArray(payload?.assets) ? payload.assets : Array.isArray(payload) ? payload : null;
  if (!assets) throw new Error('Official Robinhood registry response is malformed.');
  const records = new Map();
  for (const asset of assets) {
    const id = cleanString(asset?.id, { maxLength: 128 });
    const tokenName = cleanString(asset?.tokenName, { maxLength: 256 });
    const tokenSymbol = cleanString(asset?.tokenSymbol, { maxLength: 64 });
    if (!id || !tokenName || !tokenSymbol || !Array.isArray(asset?.deployments)) continue;
    for (const candidate of asset.deployments) {
      const deployment = normalizeDeployment(candidate);
      if (!deployment) continue;
      records.set(`${deployment.chainId}:${deployment.address.toLowerCase()}`, Object.freeze({
        canonicalAssetId: id,
        displayName: tokenName,
        symbol: tokenSymbol,
        underlyingTicker: tokenSymbol,
        chainId: deployment.chainId,
        contractAddress: deployment.address,
        status: cleanString(asset.status, { maxLength: 64 }),
        currentMultiplier: decimalString(asset.currentMultiplier),
        pendingMultiplier: decimalString(asset.pendingMultiplier),
        pendingMultiplierEffectiveTime: cleanString(asset.pendingMultiplierEffectiveTime, { maxLength: 64 }),
        tradingCapabilities: safeCapabilities(asset.tradingCapabilities),
        logoUrl: cleanString(asset.logoUrl, { maxLength: 2048 }),
      }));
    }
  }
  if (!records.size) throw new Error('Official Robinhood registry contains no valid contract deployments.');
  return records;
}

function createRobinhoodOfficialAssetRegistry({
  fetchImpl = global.fetch,
  now = () => Date.now(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sourceUrl = OFFICIAL_ASSETS_URL,
  contractsReferenceUrl = OFFICIAL_CONTRACTS_REFERENCE_URL,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('An official Robinhood registry fetch implementation is required.');
  let cached = null;
  let pending = null;

  async function load() {
    if (cached?.expiresAt > now()) return cached;
    if (pending) return pending;
    pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(sourceUrl, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response?.ok) throw new Error('Official Robinhood registry is unavailable.');
        const records = normalizeAssets(await response.json());
        cached = { records, checkedAt: new Date(now()).toISOString(), expiresAt: now() + cacheTtlMs };
        return cached;
      } finally {
        clearTimeout(timer);
        pending = null;
      }
    })();
    return pending;
  }

  async function lookup({ chainId, address } = {}) {
    if (!Number.isSafeInteger(chainId) || !isAddress(address || '', { strict: false })) throw new TypeError('A chain ID and EVM contract address are required.');
    try {
      const registry = await load();
      const normalizedAddress = getAddress(address);
      const asset = registry.records.get(`${chainId}:${normalizedAddress.toLowerCase()}`);
      const source = { url: sourceUrl, contractsReferenceUrl, checkedAt: registry.checkedAt };
      if (!asset) return { status: 'NO_MATCH', official: false, source };
      return {
        status: 'MATCH',
        official: true,
        asset: clone(asset),
        evidence: {
          type: 'ROBINHOOD_OFFICIAL_CONTRACT_REGISTRY',
          source: sourceUrl,
          matchedAddress: asset.contractAddress,
          checkedAt: registry.checkedAt,
        },
      };
    } catch (_) {
      return { status: 'UNAVAILABLE', official: null };
    }
  }

  return { lookup };
}

module.exports = {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TIMEOUT_MS,
  OFFICIAL_ASSETS_URL,
  OFFICIAL_CONTRACTS_REFERENCE_URL,
  createRobinhoodOfficialAssetRegistry,
  normalizeAssets,
};

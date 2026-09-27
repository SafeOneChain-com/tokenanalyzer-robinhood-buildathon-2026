'use strict';

// Provenance: this exact URL is configured by Chainlink's official documentation
// application for the `robinhood-mainnet` network. Keep the source narrow: this
// adapter must never accept caller supplied URLs or infer a proxy from a ticker.
const CHAINLINK_ROBINHOOD_MAINNET_DIRECTORY_URL = 'https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json';
const ROBINHOOD_MAINNET_CHAIN_ID = 4663;
const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_DIRECTORY_BYTES = 512 * 1024;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isAddress(value) { return typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value); }
function canonicalSymbol(value) { return typeof value === 'string' && /^[A-Z.]{1,16}$/i.test(value) ? value.toUpperCase() : null; }
function matchesFeedDescription(feed, description) { return typeof description === 'string' && description === feed?.description; }

function parseDirectory(payload) {
  if (!Array.isArray(payload)) throw new Error('CHAINLINK_DIRECTORY_MALFORMED');
  const records = [];
  for (const row of payload) {
    const symbol = canonicalSymbol(row?.docs?.baseAsset);
    const proxyAddress = isAddress(row?.proxyAddress) ? row.proxyAddress : null;
    const expectedName = symbol ? `Robinhood ${symbol} / USD` : null;
    if (!symbol || !proxyAddress || row?.name !== expectedName) continue;
    if (row.docs?.blockchainName !== 'Robinhood' || row.docs?.productTypeCode !== 'primaryTokenizedPrice') continue;
    if (!Number.isSafeInteger(row?.decimals) || row.decimals < 0 || row.decimals > 255) continue;
    if (!Number.isSafeInteger(row?.heartbeat) || row.heartbeat <= 0) continue;
    records.push({
      symbol,
      proxyAddress,
      description: expectedName,
      decimals: row.decimals,
      heartbeatSeconds: row.heartbeat,
      threshold: typeof row.threshold === 'number' ? row.threshold : null,
      productTypeCode: row.docs.productTypeCode,
      sourcePath: typeof row.path === 'string' ? row.path : null,
    });
  }
  return records;
}

function validateAsset(asset) {
  if (!isAddress(asset?.contractAddress) || !Number.isSafeInteger(asset?.chainId)) return null;
  return { contractAddress: asset.contractAddress, chainId: asset.chainId };
}

function createRobinhoodChainlinkFeedDirectory({
  fetchImpl = global.fetch,
  now = () => Date.now(),
  sourceUrl = CHAINLINK_ROBINHOOD_MAINNET_DIRECTORY_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  maxBytes = MAX_DIRECTORY_BYTES,
  cache = new Map(),
  officialAssetLookup = null,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  if (sourceUrl !== CHAINLINK_ROBINHOOD_MAINNET_DIRECTORY_URL) throw new Error('CHAINLINK_DIRECTORY_SOURCE_REJECTED');

  async function fetchSnapshot() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(sourceUrl, { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response?.ok) throw new Error('CHAINLINK_DIRECTORY_UNAVAILABLE');
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('CHAINLINK_DIRECTORY_TOO_LARGE');
      const records = parseDirectory(JSON.parse(text));
      return { records, sourceCheckedAt: new Date(now()).toISOString() };
    } finally { clearTimeout(timer); }
  }

  async function snapshot() {
    const key = sourceUrl;
    const prior = cache.get(key);
    if (prior?.expiresAt > now()) return { status: 'FRESH', snapshot: prior.value };
    try {
      const value = await fetchSnapshot();
      cache.set(key, { value, expiresAt: now() + cacheTtlMs });
      return { status: 'FRESH', snapshot: value };
    } catch (error) {
      if (prior?.value) return { status: 'STALE_SNAPSHOT', snapshot: prior.value, errorCode: error.message || 'CHAINLINK_DIRECTORY_UNAVAILABLE' };
      return { status: 'CHAINLINK_DIRECTORY_UNAVAILABLE', snapshot: null, errorCode: error.message || 'CHAINLINK_DIRECTORY_UNAVAILABLE' };
    }
  }

  async function lookup(asset) {
    const requested = validateAsset(asset);
    if (!requested || requested.chainId !== ROBINHOOD_MAINNET_CHAIN_ID || typeof officialAssetLookup !== 'function') return { status: 'NO_MATCH', sourceUrl };
    let official;
    try { official = await officialAssetLookup({ chainId: requested.chainId, address: requested.contractAddress }); } catch (_) { official = null; }
    const canonical = official?.status === 'MATCH' && official?.official === true ? official.asset : null;
    const symbol = canonicalSymbol(canonical?.symbol);
    if (!canonical?.canonicalAssetId || !symbol || canonical.chainId !== requested.chainId
      || String(canonical.contractAddress || '').toLowerCase() !== requested.contractAddress.toLowerCase()) {
      return { status: 'NO_MATCH', sourceUrl };
    }
    const trusted = { canonicalAssetId: canonical.canonicalAssetId, contractAddress: canonical.contractAddress, symbol, chainId: canonical.chainId };
    const result = await snapshot();
    if (!result.snapshot) return { status: result.status, sourceUrl, errorCode: result.errorCode };
    const matches = result.snapshot.records.filter((record) => record.symbol === trusted.symbol);
    if (matches.length !== 1) return { status: matches.length > 1 ? 'AMBIGUOUS_MATCH' : 'NO_MATCH', sourceUrl, sourceCheckedAt: result.snapshot.sourceCheckedAt };
    const record = matches[0];
    const feed = {
      assetId: trusted.canonicalAssetId,
      tokenAddress: trusted.contractAddress,
      chainId: trusted.chainId,
      ...record,
      sourceUrl,
      sourceCheckedAt: result.snapshot.sourceCheckedAt,
    };
    return result.status === 'FRESH'
      ? { status: 'MATCH', feed }
      : { status: 'STALE_SNAPSHOT', feed, sourceUrl, sourceCheckedAt: result.snapshot.sourceCheckedAt, errorCode: result.errorCode };
  }

  return { lookup, snapshot };
}

module.exports = {
  CHAINLINK_ROBINHOOD_MAINNET_DIRECTORY_URL,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TIMEOUT_MS,
  MAX_DIRECTORY_BYTES,
  ROBINHOOD_MAINNET_CHAIN_ID,
  createRobinhoodChainlinkFeedDirectory,
  matchesFeedDescription,
  parseDirectory,
};

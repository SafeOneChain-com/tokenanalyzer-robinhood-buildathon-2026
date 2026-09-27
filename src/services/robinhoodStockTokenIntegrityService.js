'use strict';

const { resolveRobinhoodNetwork } = require('../evm/chainRegistry');
const { createReadClient } = require('../evm/readClient');
const { decodeUint256 } = require('../evm/erc20Reader');
const { createRobinhoodOracleIntegrityService } = require('./robinhoodOracleIntegrityService');
const { createRobinhoodChainlinkFeedDirectory } = require('./robinhoodChainlinkFeedDirectory');
const { formatDecimal, multiplyDecimals, normalizeDecimal, toScaled18 } = require('./robinhoodDecimal');

const OFFICIAL_PRICES_URL = 'https://api.robinhood.com/rhj/prices';
const OFFICIAL_CORPORATE_ACTIONS_URL = 'https://api.robinhood.com/rhj/corporate-actions';
const PRICE_CACHE_TTL_MS = 15 * 1000;
const CORPORATE_ACTIONS_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 3500;
const UI_MULTIPLIER_SELECTOR = '0xa60bf13d'; // uiMultiplier()

function clone(value) { return JSON.parse(JSON.stringify(value)); }


function isoTime(value) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const year = Number(value.year); const month = Number(value.month); const day = Number(value.day);
    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
      && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.toISOString();
    }
  }
  return null;
}

function asUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : null; } catch (_) { return null; }
}

function safeAsset(asset) {
  if (!asset?.canonicalAssetId || !asset?.symbol || !asset?.displayName) return null;
  return {
    id: asset.canonicalAssetId,
    symbol: asset.symbol,
    name: asset.displayName,
    status: asset.status || null,
  };
}

function safeCorporateAction(action, asset) {
  if (!action || action.id !== asset.canonicalAssetId) return null;
  if (Array.isArray(action.deployments) && action.deployments.length) {
    const matchesDeployment = action.deployments.some((deployment) => Number(deployment?.chainId) === asset.chainId
      && String(deployment?.contractAddress || '').toLowerCase() === String(asset.contractAddress || '').toLowerCase());
    if (!matchesDeployment) return null;
  }
  const type = typeof action.type === 'string' ? action.type.replace(/^CORPORATE_ACTION_TYPE_/, '') : 'UNKNOWN';
  const status = typeof action.status === 'string' ? action.status.replace(/^CORPORATE_ACTION_STATUS_/, '') : 'UNKNOWN';
  const result = { type, status, processDate: isoTime(action.processDate) };
  const details = action.details && typeof action.details === 'object' && !Array.isArray(action.details) ? action.details : {};
  const typedDetails = type === 'CASH_DIVIDEND' && details.cashDividend && typeof details.cashDividend === 'object'
    ? details.cashDividend
    : type === 'STOCK_DIVIDEND' && details.stockDividend && typeof details.stockDividend === 'object'
      ? details.stockDividend
      : (type === 'FORWARD_SPLIT' || type === 'REVERSE_SPLIT') && details.stockSplit && typeof details.stockSplit === 'object'
        ? details.stockSplit
        : details;
  if (type === 'FORWARD_SPLIT' || type === 'REVERSE_SPLIT') {
    const oldRate = normalizeDecimal(String(typedDetails.oldRate || ''));
    const newRate = normalizeDecimal(String(typedDetails.newRate || ''));
    if (oldRate && newRate) result.details = { oldRate, newRate };
  } else if (type === 'CASH_DIVIDEND') {
    const amount = normalizeDecimal(String(typedDetails.amount || typedDetails.rate || ''));
    if (amount) result.details = { amount, currency: typeof typedDetails.currency === 'string' ? typedDetails.currency : null };
  } else if (type === 'STOCK_DIVIDEND') {
    const rate = normalizeDecimal(String(typedDetails.rate || typedDetails.amount || ''));
    if (rate) result.details = { rate };
  }
  return result;
}

function isExactDeployment(deployment, asset) {
  return Number(deployment?.chainId) === asset.chainId
    && String(deployment?.contractAddress || '').toLowerCase() === String(asset.contractAddress || '').toLowerCase();
}

function exactReferenceQuote(body, asset) {
  const quotes = Array.isArray(body?.quotes) ? body.quotes : [];
  const matches = quotes.filter((quote) => quote && quote.tokenSymbol === asset.symbol
    && Array.isArray(quote.deployments) && quote.deployments.some((deployment) => isExactDeployment(deployment, asset)));
  return matches.length === 1 ? matches[0] : null;
}

function createRobinhoodStockTokenIntegrityService({
  env = process.env,
  fetchImpl = global.fetch,
  createClient = createReadClient,
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  readUiMultiplier = null,
  priceUrl = OFFICIAL_PRICES_URL,
  corporateActionsUrl = OFFICIAL_CORPORATE_ACTIONS_URL,
  priceCache = new Map(),
  corporateActionsCache = new Map(),
  priceIntegrityService = null,
  officialAssetRegistry = null,
  feedDirectory = null,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const directory = feedDirectory || (officialAssetRegistry?.lookup
    ? createRobinhoodChainlinkFeedDirectory({ officialAssetLookup: officialAssetRegistry.lookup })
    : null);
  const oracleIntegrity = priceIntegrityService || createRobinhoodOracleIntegrityService({ now, createClient, feedRegistry: directory || undefined });

  async function fetchJson(url) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response?.ok) throw new Error('Official Robinhood Chain API is unavailable.');
      return response.json();
    } finally { clearTimeout(timer); }
  }

  async function cached(map, key, ttl, loader) {
    const value = map.get(key);
    if (value?.expiresAt > now()) return clone(value.value);
    const loaded = await loader();
    map.set(key, { value: loaded, expiresAt: now() + ttl });
    return clone(loaded);
  }

  async function loadReferencePrice(asset, multiplier) {
    try {
      const key = `${asset.chainId}:${asset.contractAddress.toLowerCase()}`;
      const body = await cached(priceCache, key, PRICE_CACHE_TTL_MS, () => fetchJson(`${priceUrl}/${encodeURIComponent(asset.symbol)}`));
      const quote = exactReferenceQuote(body, asset);
      if (!quote) throw new Error('No exact official price quote matches this deployed Stock Token.');
      const underlyingBid = normalizeDecimal(String(quote?.bid || ''));
      const underlyingAsk = normalizeDecimal(String(quote?.ask || ''));
      const generatedAt = isoTime(quote?.generatedAt);
      if (!underlyingBid || !underlyingAsk || !generatedAt || typeof quote?.currency !== 'string') throw new Error('Malformed price response.');
      return {
        availability: 'AVAILABLE', currency: quote.currency, underlyingBid, underlyingAsk,
        tokenEquivalentBid: multiplier ? multiplyDecimals(underlyingBid, multiplier) : null,
        tokenEquivalentAsk: multiplier ? multiplyDecimals(underlyingAsk, multiplier) : null,
        generatedAt, tradingHalt: typeof quote.isTradingHalt === 'boolean' ? quote.isTradingHalt : null,
        stale: now() - Date.parse(generatedAt) > PRICE_CACHE_TTL_MS * 2,
      };
    } catch (_) { return { availability: 'API_UNAVAILABLE' }; }
  }

  async function loadCorporateActions(asset) {
    try {
      const body = await cached(corporateActionsCache, 'all', CORPORATE_ACTIONS_CACHE_TTL_MS, () => fetchJson(corporateActionsUrl));
      const actions = Array.isArray(body?.corpActions) ? body.corpActions : null;
      if (!actions) throw new Error('Malformed corporate actions response.');
      return { availability: 'AVAILABLE', actions: actions.map((action) => safeCorporateAction(action, asset)).filter(Boolean) };
    } catch (_) { return { availability: 'API_UNAVAILABLE', actions: [] }; }
  }

  async function readOnchainMultiplier(asset) {
    if (typeof readUiMultiplier === 'function') return readUiMultiplier(asset);
    try {
      const network = resolveRobinhoodNetwork('robinhood-mainnet', env);
      if (network.chainId !== asset.chainId) return { availability: 'ONCHAIN_UNAVAILABLE' };
      const client = createClient({ network });
      const block = await client.getValidatedBlockContext();
      const raw = decodeUint256(await client.call(asset.contractAddress, UI_MULTIPLIER_SELECTOR, block.tag));
      return { availability: 'AVAILABLE', value: formatDecimal(raw, 18), checkedAt: new Date(now()).toISOString(), block: block.number };
    } catch (_) { return { availability: 'ONCHAIN_UNAVAILABLE' }; }
  }

  async function inspect(asset, network = null) {
    const publicAsset = safeAsset(asset);
    if (!publicAsset) return null;
    const current = normalizeDecimal(asset.currentMultiplier || '');
    if (!current) {
      return {
      status: 'INSUFFICIENT_EVIDENCE', asset: publicAsset,
        tradingCapabilities: asset.tradingCapabilities || null,
        multiplier: { current: null, onchain: null, comparison: 'API_UNAVAILABLE', pending: null, pendingEffectiveAt: null },
        referencePrice: { availability: 'API_UNAVAILABLE' }, corporateActions: [],
        evidence: [{ state: 'INSUFFICIENT_EVIDENCE', source: 'ROBINHOOD_CHAIN_ASSET_API' }],
      };
    }
    const pending = normalizeDecimal(asset.pendingMultiplier || '');
    const onchainResult = current ? await readOnchainMultiplier(asset) : { availability: 'API_UNAVAILABLE' };
    const onchain = onchainResult?.availability === 'AVAILABLE' ? normalizeDecimal(onchainResult.value || '') : null;
    const comparison = !current ? 'API_UNAVAILABLE' : !onchain ? 'ONCHAIN_UNAVAILABLE'
      : toScaled18(current) === toScaled18(onchain) ? 'MATCH' : 'MISMATCH';
    const [referencePrice, corporate] = await Promise.all([loadReferencePrice(asset, current), loadCorporateActions(asset)]);
    const evidence = [{ state: comparison === 'MATCH' ? 'MULTIPLIER_CONFIRMED' : comparison === 'MISMATCH' ? 'MULTIPLIER_MISMATCH' : 'INSUFFICIENT_EVIDENCE', source: 'ROBINHOOD_CHAIN_ASSET_API' }];
    if (pending) evidence.push({ state: 'MULTIPLIER_PENDING', source: 'ROBINHOOD_CHAIN_ASSET_API' });
    if (corporate.actions.some((action) => action.type === 'FORWARD_SPLIT' || action.type === 'REVERSE_SPLIT')) evidence.push({ state: 'MULTIPLIER_CHANGE_EXPLAINED', source: 'ROBINHOOD_CHAIN_CORPORATE_ACTIONS_API' });
    const priceIntegrity = await oracleIntegrity.inspect({ ...asset, network }, referencePrice);
    return {
      status: comparison === 'MISMATCH' ? 'MULTIPLIER_MISMATCH' : pending ? 'MULTIPLIER_PENDING' : comparison === 'MATCH' ? 'MULTIPLIER_CONFIRMED' : 'INSUFFICIENT_EVIDENCE',
      asset: publicAsset,
      tradingCapabilities: asset.tradingCapabilities || null,
      multiplier: { current, onchain, comparison, pending, pendingEffectiveAt: isoTime(asset.pendingMultiplierEffectiveTime) },
      referencePrice,
      corporateActions: corporate.actions,
      evidence,
      priceIntegrity,
    };
  }
  return { inspect };
}

module.exports = {
  CORPORATE_ACTIONS_CACHE_TTL_MS, DEFAULT_TIMEOUT_MS, OFFICIAL_CORPORATE_ACTIONS_URL, OFFICIAL_PRICES_URL, PRICE_CACHE_TTL_MS,
  UI_MULTIPLIER_SELECTOR, createRobinhoodStockTokenIntegrityService, exactReferenceQuote, formatDecimal, multiplyDecimals, normalizeDecimal, toScaled18,
};

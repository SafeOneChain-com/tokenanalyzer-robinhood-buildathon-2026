'use strict';

const { decodeUint256 } = require('../evm/erc20Reader');
const { createReadClient } = require('../evm/readClient');
const { formatDecimal } = require('./robinhoodDecimal');

const AGGREGATOR_DECIMALS_SELECTOR = '0x313ce567';
const LATEST_ROUND_DATA_SELECTOR = '0xfeaf968c';
const ORACLE_PAUSED_SELECTOR = '0x7706ba52';
const ORACLE_CACHE_TTL_MS = 15 * 1000;
const CHAINLINK_ROBINHOOD_FEEDS_URL = 'https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood';
const SEQUENCER_UPTIME_NOT_PUBLISHED = 'SEQUENCER_UPTIME_FEED_NOT_PUBLISHED';

function parts(value) { if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null; const [w, f = ''] = value.split('.'); return { n: BigInt(`${w}${f}`), s: f.length }; }
function align(a, b) { const x = parts(a); const y = parts(b); if (!x || !y) return null; const s = Math.max(x.s, y.s); return [x.n * 10n ** BigInt(s - x.s), y.n * 10n ** BigInt(s - y.s), s]; }
function compareDecimal(a, b) { const v = align(a, b); return v ? (v[0] === v[1] ? 0 : v[0] > v[1] ? 1 : -1) : null; }
function midpoint(a, b) { const v = align(a, b); if (!v) return null; return (v[0] + v[1]) % 2n === 0n ? formatDecimal((v[0] + v[1]) / 2n, v[2]) : formatDecimal(v[0] + v[1], v[2] + 1); }
function deviationPct(price, reference) { const v = align(price, reference); if (!v || v[1] === 0n) return null; const scale = 18; return formatDecimal((v[0] - v[1]) * 100n * 10n ** BigInt(scale) / v[1], scale); }
function decodeSignedUint(value) { const raw = decodeUint256(value); return raw >= 2n ** 255n ? raw - 2n ** 256n : raw; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function decodeRound(value) {
  if (typeof value !== 'string' || !/^0x[\da-f]{320}$/i.test(value)) throw new Error('Malformed latestRoundData response.');
  const words = Array.from({ length: 5 }, (_, i) => `0x${value.slice(2 + i * 64, 2 + (i + 1) * 64)}`);
  return { roundId: decodeUint256(words[0]).toString(), answer: decodeSignedUint(words[1]), startedAt: decodeUint256(words[2]).toString(), updatedAt: decodeUint256(words[3]).toString(), answeredInRound: decodeUint256(words[4]).toString() };
}
function exactFeed(asset, feed) { return feed && feed.chainId === asset.chainId && String(feed.tokenAddress || '').toLowerCase() === String(asset.contractAddress || '').toLowerCase() && feed.assetId === asset.canonicalAssetId ? feed : null; }
function createChainlinkRobinhoodFeedRegistry({ records = [], sourceUrl = CHAINLINK_ROBINHOOD_FEEDS_URL, sourceVersion = null } = {}) {
  const entries = Array.isArray(records) ? records.map((row) => ({ ...row, sourceUrl, sourceVersion })).filter((row) => row.assetId && row.tokenAddress && row.proxyAddress && Number.isSafeInteger(row.chainId)) : [];
  return { lookup: async (asset) => { const match = entries.find((row) => exactFeed(asset, row)); return match ? { status: 'MATCH', feed: { ...match } } : { status: 'NO_MATCH', sourceUrl }; } };
}
function unavailableMarket() { return { status: 'NO_RELIABLE_MARKET_SOURCE', venue: null, pool: null, price: null, liquidity: null, observedAt: null }; }
function unavailableSequencer() { return { status: SEQUENCER_UPTIME_NOT_PUBLISHED, source: 'CHAINLINK_SEQUENCER_UPTIME_DIRECTORY', unavailableReason: 'No official Chainlink Sequencer Uptime Feed is currently published for Robinhood Chain.' }; }
function referenceSource(reference) {
  const available = (reference?.availability === undefined || reference?.availability === 'AVAILABLE') && reference?.tokenEquivalentBid && reference.tokenEquivalentAsk;
  return { source: 'ROBINHOOD_REFERENCE', sourceName: 'Robinhood Reference', status: available ? (reference.stale ? 'STALE' : 'AVAILABLE') : 'UNAVAILABLE', currency: available ? reference.currency : null, valueBasis: 'Underlying reference bid/ask × currentMultiplier', bid: available ? reference.tokenEquivalentBid : null, ask: available ? reference.tokenEquivalentAsk : null, underlyingBid: available ? reference.underlyingBid : null, underlyingAsk: available ? reference.underlyingAsk : null, sourceDataAt: available ? reference.generatedAt : null, freshness: available ? (reference.stale ? 'STALE' : 'FRESH') : 'UNAVAILABLE', unavailableReason: available ? null : 'REFERENCE_UNAVAILABLE' };
}
function marketSource(observed) { return { source: 'AMM_MARKET', sourceName: 'Observed Market', status: observed?.status === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE', currency: null, valueBasis: 'Observed exact Stock Token market', value: observed?.price || null, sourceDataAt: observed?.observedAt || null, freshness: observed?.observedAt ? 'OBSERVED' : 'UNAVAILABLE', unavailableReason: observed?.status || 'NO_RELIABLE_MARKET_SOURCE', venue: observed?.venue || null, pool: observed?.pool || null }; }
function mappingStatus(mapping) { if (mapping?.status === 'NO_MATCH' || mapping?.status === 'AMBIGUOUS_MATCH') return 'OFFICIAL_FEED_MAPPING_UNAVAILABLE'; if (mapping?.status === 'CHAINLINK_DIRECTORY_UNAVAILABLE') return 'CHAINLINK_DIRECTORY_UNAVAILABLE'; return mapping?.status || 'OFFICIAL_FEED_MAPPING_UNAVAILABLE'; }
function overallStatus({ reference, oracle, comparison, asset }) {
  const sourceAvailable = reference.status === 'AVAILABLE' || oracle.status === 'AVAILABLE';
  if (!sourceAvailable) return { status: 'UNAVAILABLE', consistency: 'UNAVAILABLE' };
  if (asset?.pendingMultiplier) return { status: 'PENDING_CHANGE', consistency: comparison.status === 'WITHIN_REFERENCE_SPREAD' ? 'CONSISTENT' : 'PARTIAL' };
  if (reference.status === 'AVAILABLE' && oracle.status === 'AVAILABLE') return comparison.status === 'WITHIN_REFERENCE_SPREAD' ? { status: 'PARTIAL', consistency: 'CONSISTENT' } : { status: 'MISMATCH', consistency: 'MISMATCH' };
  return { status: 'PARTIAL', consistency: 'PARTIAL' };
}

function createRobinhoodOracleIntegrityService({ now = () => Date.now(), createClient = createReadClient, feedRegistry = createChainlinkRobinhoodFeedRegistry(), sequencerReader = null, marketReader = null, cache = new Map() } = {}) {
  async function inspect(asset, referencePrice) {
    const mapping = await feedRegistry.lookup(asset);
    const reference = referenceSource(referencePrice);
    const mappingState = mappingStatus(mapping);
    const sequencer = sequencerReader ? { ...(await sequencerReader({ asset })) } : unavailableSequencer();
    if (mapping.status !== 'MATCH') {
      const oracleSource = { source: 'CHAINLINK_ORACLE', sourceName: 'Chainlink Onchain Oracle', status: mappingState, currency: null, valueBasis: 'Price per Stock Token; multiplier-adjusted by Chainlink when available', value: null, sourceDataAt: null, freshness: 'UNAVAILABLE', unavailableReason: mappingState, feed: null };
      const observedMarket = unavailableMarket(); const observed = marketSource(observedMarket); const overall = overallStatus({ reference, oracle: oracleSource, comparison: { status: 'ORACLE_UNAVAILABLE' }, asset });
      return { status: overall.status, mapping: { status: mappingState, sourceUrl: mapping.sourceUrl || null, sourceCheckedAt: mapping.sourceCheckedAt || null }, officialFeed: null, oracle: { status: mappingState }, sequencer, oraclePaused: { status: 'UNAVAILABLE' }, referenceComparison: { status: 'ORACLE_UNAVAILABLE', bid: reference.bid, ask: reference.ask, deviationPct: null }, observedMarket, priceSources: { robinhoodReference: reference, chainlinkOracle: oracleSource, observedMarket: observed }, overall, evidence: [{ state: mappingState, source: 'CHAINLINK_OFFICIAL_FEED_LIST' }, { state: reference.status === 'AVAILABLE' ? 'REFERENCE_AVAILABLE' : 'REFERENCE_UNAVAILABLE', source: 'ROBINHOOD_REFERENCE' }] };
    }
    const feed = exactFeed(asset, mapping.feed);
    if (!feed) return { status: 'PARTIAL', mapping: { status: 'OFFICIAL_FEED_MAPPING_UNAVAILABLE', sourceUrl: mapping.feed?.sourceUrl || null }, officialFeed: null, oracle: { status: 'OFFICIAL_FEED_MAPPING_UNAVAILABLE' }, sequencer, oraclePaused: { status: 'UNAVAILABLE' }, referenceComparison: { status: 'ORACLE_UNAVAILABLE', bid: reference.bid, ask: reference.ask, deviationPct: null }, observedMarket: unavailableMarket(), priceSources: { robinhoodReference: reference, chainlinkOracle: { source: 'CHAINLINK_ORACLE', sourceName: 'Chainlink Onchain Oracle', status: 'OFFICIAL_FEED_MAPPING_UNAVAILABLE', unavailableReason: 'OFFICIAL_FEED_MAPPING_UNAVAILABLE' }, observedMarket: marketSource(unavailableMarket()) }, overall: { status: reference.status === 'AVAILABLE' ? 'PARTIAL' : 'UNAVAILABLE', consistency: 'PARTIAL' }, evidence: [{ state: 'OFFICIAL_FEED_MAPPING_UNAVAILABLE', source: 'CHAINLINK_OFFICIAL_FEED_LIST' }] };
    const key = `${asset.chainId}:${feed.proxyAddress.toLowerCase()}`; const prior = cache.get(key); if (prior?.expiresAt > now()) return clone(prior.value);
    let paused = { status: 'UNAVAILABLE' }; let oracle = { status: 'ORACLE_UNAVAILABLE' };
    try {
      const client = createClient({ network: asset.network }); const block = await client.getValidatedBlockContext();
      // `oraclePaused()` belongs to the exact official Stock Token contract. The
      // Chainlink proxy supplies the feed metadata and round data, but does not expose
      // this token-specific pause state.
      const pauseRaw = decodeUint256(await client.call(asset.contractAddress, ORACLE_PAUSED_SELECTOR, block.tag)); paused = { status: pauseRaw === 0n ? 'NOT_PAUSED' : 'ORACLE_PAUSED' };
      const decimalsRaw = decodeUint256(await client.call(feed.proxyAddress, AGGREGATOR_DECIMALS_SELECTOR, block.tag)); if (decimalsRaw > 255n) throw new Error('Invalid oracle decimals.');
      const round = decodeRound(await client.call(feed.proxyAddress, LATEST_ROUND_DATA_SELECTOR, block.tag));
      const updatedAt = Number(round.updatedAt); if (!Number.isSafeInteger(updatedAt) || updatedAt <= 0 || round.answer <= 0n) throw new Error('Invalid oracle round.');
      const heartbeat = Number.isSafeInteger(feed.heartbeatSeconds) && feed.heartbeatSeconds > 0 ? feed.heartbeatSeconds : null;
      const freshness = heartbeat ? (now() - updatedAt * 1000 <= (heartbeat + 60) * 1000 ? 'FRESH' : 'STALE') : 'HEARTBEAT_UNKNOWN';
      oracle = { price: formatDecimal(round.answer, Number(decimalsRaw)), decimals: Number(decimalsRaw), roundId: round.roundId, startedAt: new Date(Number(round.startedAt) * 1000).toISOString(), updatedAt: new Date(updatedAt * 1000).toISOString(), answeredInRound: round.answeredInRound, freshness, checkedAt: new Date(now()).toISOString(), block: block.number };
    } catch (_) { oracle = { status: 'FEED_READ_ERROR' }; }
    const usable = oracle.price && oracle.freshness === 'FRESH' && paused.status === 'NOT_PAUSED';
    const bid = reference.bid; const ask = reference.ask; const mid = midpoint(bid, ask);
    const comparison = !oracle.price ? { status: 'ORACLE_UNAVAILABLE', bid: bid || null, ask: ask || null, deviationPct: null } : !bid || !ask ? { status: 'REFERENCE_UNAVAILABLE', bid: bid || null, ask: ask || null, deviationPct: null } : { status: compareDecimal(oracle.price, bid) >= 0 && compareDecimal(oracle.price, ask) <= 0 ? 'WITHIN_REFERENCE_SPREAD' : 'OUTSIDE_REFERENCE_SPREAD', bid, ask, referenceMid: mid, deviationPct: deviationPct(oracle.price, mid) };
    const observedMarket = marketReader ? await marketReader({ asset, oraclePrice: oracle.price, referencePrice }) : unavailableMarket();
    const oracleSource = { source: 'CHAINLINK_ORACLE', sourceName: 'Chainlink Onchain Oracle', status: usable ? 'AVAILABLE' : oracle.freshness === 'STALE' ? 'STALE' : paused.status === 'ORACLE_PAUSED' ? 'ORACLE_PAUSED' : 'UNAVAILABLE', currency: oracle.price ? 'USD' : null, valueBasis: 'Price per Stock Token; multiplier-adjusted by Chainlink', value: oracle.price || null, sourceDataAt: oracle.updatedAt || null, freshness: oracle.freshness || 'UNAVAILABLE', unavailableReason: usable ? null : oracle.status || oracle.freshness || paused.status, feed: { proxyAddress: feed.proxyAddress, description: feed.description || null, sourceUrl: feed.sourceUrl, sourceCheckedAt: feed.sourceCheckedAt || null } };
    const observed = marketSource(observedMarket); const overall = overallStatus({ reference, oracle: oracleSource, comparison, asset });
    const status = sequencer.status === 'DOWN' ? 'SEQUENCER_UNAVAILABLE' : usable ? (sequencer.status === 'UP' ? 'ORACLE_VERIFIED' : 'ORACLE_AVAILABLE') : paused.status === 'ORACLE_PAUSED' ? 'ORACLE_PAUSED' : oracle.freshness === 'STALE' ? 'ORACLE_STALE' : oracle.price ? 'ORACLE_HEARTBEAT_UNKNOWN' : 'FEED_READ_ERROR';
    const value = { status, mapping: { status: 'VERIFIED', sourceUrl: feed.sourceUrl, sourceCheckedAt: feed.sourceCheckedAt || null }, officialFeed: { proxyAddress: feed.proxyAddress, pair: feed.pair || feed.description || null, sourceReference: feed.sourceUrl, sourceVersion: feed.sourceVersion || null, heartbeatSeconds: feed.heartbeatSeconds || null }, oracle, sequencer, oraclePaused: paused, referenceComparison: comparison, observedMarket, priceSources: { robinhoodReference: reference, chainlinkOracle: oracleSource, observedMarket: observed }, overall, evidence: [{ state: oracle.price ? 'ONCHAIN_ORACLE_AVAILABLE' : 'ORACLE_UNAVAILABLE', source: 'CHAINLINK_OFFICIAL_FEED_LIST' }, { state: comparison.status, source: 'ROBINHOOD_REFERENCE_COMPARISON' }, { state: sequencer.status, source: 'CHAINLINK_SEQUENCER_UPTIME_DIRECTORY' }] };
    cache.set(key, { value, expiresAt: now() + ORACLE_CACHE_TTL_MS }); return clone(value);
  }
  return { inspect };
}

module.exports = { AGGREGATOR_DECIMALS_SELECTOR, CHAINLINK_ROBINHOOD_FEEDS_URL, LATEST_ROUND_DATA_SELECTOR, ORACLE_CACHE_TTL_MS, ORACLE_PAUSED_SELECTOR, SEQUENCER_UPTIME_NOT_PUBLISHED, compareDecimal, createChainlinkRobinhoodFeedRegistry, createRobinhoodOracleIntegrityService, decodeRound, deviationPct, midpoint };

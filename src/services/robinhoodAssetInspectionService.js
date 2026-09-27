'use strict';

const { getAddress, isAddress } = require('viem');
const { resolveRobinhoodNetwork } = require('../evm/chainRegistry');
const { RpcReadError, createReadClient } = require('../evm/readClient');
const { readErc20Fields } = require('../evm/erc20Reader');
const { createRobinhoodStockTokenIntegrityService } = require('./robinhoodStockTokenIntegrityService');

const CACHE_TTL_MS = 45 * 1000;
const TRANSIENT_ERROR_CACHE_TTL_MS = 2 * 1000;
const INSPECTION_VERSION = 'robinhood-gate-1a-v1';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isContractCode(value) { return typeof value === 'string' && /^0x[0-9a-f]*$/i.test(value); }

function errorStatus(error) {
  const code = error?.code || 'RPC_PROVIDER_ERROR';
  if (code === 'CHAIN_ID_MISMATCH') return { httpStatus: 502, code: 'CHAIN_ID_MISMATCH', inspectionStatus: 'CHAIN_MISMATCH' };
  if (code === 'RPC_RATE_LIMITED') return { httpStatus: 429, code, inspectionStatus: 'RATE_LIMITED' };
  if (code === 'RPC_TIMEOUT') return { httpStatus: 504, code, inspectionStatus: 'TIMED_OUT' };
  if (code === 'RPC_BUDGET_EXHAUSTED') return { httpStatus: 503, code, inspectionStatus: 'BUDGET_EXHAUSTED' };
  return { httpStatus: 502, code: 'RPC_UNAVAILABLE', inspectionStatus: 'UNAVAILABLE' };
}

function validateInspectionInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Invalid request body.'); error.code = 'INVALID_INPUT'; throw error;
  }
  if (Object.keys(input).some((key) => key !== 'network' && key !== 'address')) {
    const error = new Error('Unsupported request field.'); error.code = 'INVALID_INPUT'; throw error;
  }
  const network = String(input.network || '').trim();
  const address = String(input.address || '').trim();
  if (!network || !isAddress(address, { strict: false })) {
    const error = new Error('Invalid Robinhood Chain inspection input.'); error.code = 'INVALID_INPUT'; throw error;
  }
  return { network, address: getAddress(address) };
}

function buildNoCodeResult(network, address, block, checkedAt) {
  const fields = Object.fromEntries(['name', 'symbol', 'decimals', 'totalSupplyRaw'].map((key) => [key, { status: 'UNAVAILABLE' }]));
  return {
    ok: true,
    network: { key: network.key, name: network.name, chainId: network.chainId },
    contract: { address, hasCode: false },
    block: { number: block.number, hash: block.hash },
    tokenStandardObservation: { likelyErc20: { value: null, reason: 'NO_CONTRACT_CODE' }, fields },
    inspection: { version: INSPECTION_VERSION, checkedAt, status: 'NO_CONTRACT_CODE' },
  };
}

function technicalOnlyIdentity(classification, verificationStatus) {
  return { classification, official: false, evidence: [], verificationStatus };
}

async function addAssetIdentity(result, registry) {
  if (!result.ok) return { ...result, assetIdentity: technicalOnlyIdentity('INSPECTION_ERROR', 'TECHNICAL_INSPECTION_ONLY') };
  if (result.inspection.status === 'NO_CONTRACT_CODE') {
    return { ...result, assetIdentity: technicalOnlyIdentity('NO_CONTRACT_CODE', 'TECHNICAL_INSPECTION_ONLY') };
  }
  if (!registry || typeof registry.lookup !== 'function') {
    return { ...result, assetIdentity: { classification: 'INSPECTION_PARTIAL', official: null, evidence: [], verificationStatus: 'PARTIAL_EVIDENCE' } };
  }
  let lookup;
  try {
    lookup = await registry.lookup({ chainId: result.network.chainId, address: result.contract.address });
  } catch (_) {
    lookup = { status: 'UNAVAILABLE', official: null };
  }
  if (lookup.status === 'MATCH') {
    return {
      ...result,
      assetIdentity: {
        classification: 'OFFICIAL_STOCK_TOKEN', official: true, evidence: [lookup.evidence],
        canonicalAsset: lookup.asset, verificationStatus: 'VERIFIED_IDENTITY',
      },
    };
  }
  if (lookup.status === 'UNAVAILABLE') {
    return { ...result, assetIdentity: { classification: 'INSPECTION_PARTIAL', official: null, evidence: [], verificationStatus: 'PARTIAL_EVIDENCE' } };
  }
  const likelyErc20 = result.tokenStandardObservation?.likelyErc20?.value === true;
  return {
    ...result,
    assetIdentity: technicalOnlyIdentity(likelyErc20 ? 'STANDARD_TOKEN' : 'UNKNOWN_ASSET_TYPE', 'NO_OFFICIAL_MATCH'),
  };
}

async function addStockTokenIntegrity(result, integrityService, network = null) {
  if (result?.assetIdentity?.classification !== 'OFFICIAL_STOCK_TOKEN' || !integrityService?.inspect) return result;
  try {
    // `result.network` is the public response shape and deliberately omits the
    // RPC URL. Oracle reads need the resolved internal network instead.
    const stockTokenIntegrity = await integrityService.inspect(result.assetIdentity.canonicalAsset, network);
    return stockTokenIntegrity ? { ...result, stockTokenIntegrity } : result;
  } catch (_) {
    return {
      ...result,
      stockTokenIntegrity: {
        status: 'INSUFFICIENT_EVIDENCE', asset: null,
        multiplier: { current: null, onchain: null, comparison: 'API_UNAVAILABLE', pending: null, pendingEffectiveAt: null },
        referencePrice: { availability: 'API_UNAVAILABLE' }, corporateActions: [],
        evidence: [{ state: 'INSUFFICIENT_EVIDENCE', source: 'ROBINHOOD_CHAIN_ASSET_API' }],
      },
    };
  }
}

function createRobinhoodAssetInspectionService({
  env = process.env,
  createClient = createReadClient,
  cache = new Map(),
  now = () => Date.now(),
  officialAssetRegistry = null,
  stockTokenIntegrityService = null,
} = {}) {
  const integrityService = stockTokenIntegrityService || createRobinhoodStockTokenIntegrityService({ env, createClient, now, officialAssetRegistry });
  async function inspect(input) {
    const validated = validateInspectionInput(input);
    const network = resolveRobinhoodNetwork(validated.network, env);
    const cacheKey = `${network.chainId}:${validated.address.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached?.expiresAt > now()) return clone(cached.result);
    try {
      const client = createClient({ network });
      const block = await client.getValidatedBlockContext();
      const code = await client.getCode(validated.address, block.tag);
      if (!isContractCode(code)) throw new RpcReadError('RPC_MALFORMED_RESPONSE');
      const checkedAt = new Date(now()).toISOString();
      if (code === '0x') {
        const result = await addStockTokenIntegrity(await addAssetIdentity(buildNoCodeResult(network, validated.address, block, checkedAt), officialAssetRegistry), integrityService, network);
        cache.set(cacheKey, { expiresAt: now() + CACHE_TTL_MS, result });
        return clone(result);
      }
      const fields = await readErc20Fields(client, validated.address, block.tag);
      const complete = Object.values(fields).every((field) => field.status === 'AVAILABLE');
      const technicalResult = {
        ok: true,
        network: { key: network.key, name: network.name, chainId: network.chainId },
        contract: { address: validated.address, hasCode: true },
        block: { number: block.number, hash: block.hash },
        tokenStandardObservation: {
          likelyErc20: { value: complete ? true : null, reason: complete ? 'ALL_SELECTED_STANDARD_READS_AVAILABLE' : 'INCOMPLETE_SELECTED_READS' },
          fields,
        },
        inspection: { version: INSPECTION_VERSION, checkedAt, status: 'COMPLETED' },
      };
      const result = await addStockTokenIntegrity(await addAssetIdentity(technicalResult, officialAssetRegistry), integrityService, network);
      cache.set(cacheKey, { expiresAt: now() + CACHE_TTL_MS, result });
      return clone(result);
    } catch (error) {
      const classified = errorStatus(error);
      const result = await addStockTokenIntegrity(await addAssetIdentity({
        ok: false,
        error: classified.code,
        inspection: { version: INSPECTION_VERSION, checkedAt: new Date(now()).toISOString(), status: classified.inspectionStatus },
      }, officialAssetRegistry), integrityService, network);
      if (classified.code === 'RPC_RATE_LIMITED' || classified.code === 'RPC_TIMEOUT') {
        cache.set(cacheKey, { expiresAt: now() + TRANSIENT_ERROR_CACHE_TTL_MS, result });
      }
      return { ...result, httpStatus: classified.httpStatus };
    }
  }
  return { inspect };
}

module.exports = { CACHE_TTL_MS, INSPECTION_VERSION, TRANSIENT_ERROR_CACHE_TTL_MS, addAssetIdentity, addStockTokenIntegrity, createRobinhoodAssetInspectionService, errorStatus, validateInspectionInput };

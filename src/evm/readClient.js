'use strict';

const ALLOWED_RPC_METHODS = Object.freeze(new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call',
]));
const DEFAULT_TOTAL_TIMEOUT_MS = 9000;
const DEFAULT_CALL_TIMEOUT_MS = 2200;
const DEFAULT_MAX_CALLS = 10;

class RpcReadError extends Error {
  constructor(code, message = 'Robinhood Chain RPC read failed.') {
    super(message);
    this.code = code;
  }
}

function createConcurrencyLimiter(limit = 4) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= limit || !queue.length) return;
    const entry = queue.shift();
    active += 1;
    Promise.resolve().then(entry.task).then(entry.resolve, entry.reject).finally(() => {
      active -= 1;
      runNext();
    });
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    runNext();
  });
}

const globalRpcLimiter = createConcurrencyLimiter(4);

function parseHexQuantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new RpcReadError('RPC_MALFORMED_RESPONSE');
  return BigInt(value);
}

function toSafeBlockNumber(value) {
  const parsed = parseHexQuantity(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new RpcReadError('RPC_MALFORMED_RESPONSE');
  return Number(parsed);
}

function isBlockHash(value) {
  return typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value);
}

function classifyFetchFailure(error) {
  if (error?.code === 'RPC_TIMEOUT' || error?.name === 'AbortError') return 'RPC_TIMEOUT';
  return 'RPC_PROVIDER_ERROR';
}

function createReadClient({ network, fetchImpl = global.fetch, totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS, callTimeoutMs = DEFAULT_CALL_TIMEOUT_MS, maxCalls = DEFAULT_MAX_CALLS, now = () => Date.now(), limiter = globalRpcLimiter } = {}) {
  if (!network?.rpcUrl || !Number.isSafeInteger(network?.chainId)) throw new TypeError('An enabled Robinhood Chain network is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const startedAt = now();
  let calls = 0;

  async function rpc(method, params = []) {
    if (!ALLOWED_RPC_METHODS.has(method)) throw new RpcReadError('RPC_METHOD_NOT_ALLOWED');
    if (++calls > maxCalls || now() - startedAt >= totalTimeoutMs) throw new RpcReadError('RPC_BUDGET_EXHAUSTED');
    const remaining = totalTimeoutMs - (now() - startedAt);
    const timeout = Math.max(1, Math.min(callTimeoutMs, remaining));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await limiter(() => fetchImpl(network.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: calls, method, params }),
        signal: controller.signal,
      }));
      if (response?.status === 429) throw new RpcReadError('RPC_RATE_LIMITED');
      if (!response?.ok) throw new RpcReadError('RPC_PROVIDER_ERROR');
      let body;
      try { body = await response.json(); } catch (_) { throw new RpcReadError('RPC_MALFORMED_RESPONSE'); }
      if (!body || body.jsonrpc !== '2.0') throw new RpcReadError('RPC_MALFORMED_RESPONSE');
      if (body.error) throw new RpcReadError(method === 'eth_call' ? 'RPC_CALL_REVERTED' : 'RPC_PROVIDER_ERROR');
      if (!Object.hasOwn(body, 'result')) throw new RpcReadError('RPC_MALFORMED_RESPONSE');
      return body.result;
    } catch (error) {
      if (error instanceof RpcReadError) throw error;
      throw new RpcReadError(classifyFetchFailure(error));
    } finally {
      clearTimeout(timer);
    }
  }

  async function getValidatedBlockContext() {
    const chainId = toSafeBlockNumber(await rpc('eth_chainId'));
    if (chainId !== network.chainId) throw new RpcReadError('CHAIN_ID_MISMATCH');
    const blockTag = await rpc('eth_blockNumber');
    const number = toSafeBlockNumber(blockTag);
    const block = await rpc('eth_getBlockByNumber', [blockTag, false]);
    if (!block || !isBlockHash(block.hash)) throw new RpcReadError('RPC_MALFORMED_RESPONSE');
    return { number, hash: block.hash, tag: blockTag };
  }

  return {
    getValidatedBlockContext,
    getCode: (address, blockTag) => rpc('eth_getCode', [address, blockTag]),
    call: (address, data, blockTag) => rpc('eth_call', [{ to: address, data }, blockTag]),
    rpc,
  };
}

module.exports = {
  ALLOWED_RPC_METHODS,
  DEFAULT_CALL_TIMEOUT_MS,
  DEFAULT_MAX_CALLS,
  DEFAULT_TOTAL_TIMEOUT_MS,
  RpcReadError,
  createConcurrencyLimiter,
  createReadClient,
  globalRpcLimiter,
};

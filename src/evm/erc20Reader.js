'use strict';

const { RpcReadError } = require('./readClient');

const ERC20_READS = Object.freeze({
  name: Object.freeze({ selector: '0x06fdde03', type: 'string' }),
  symbol: Object.freeze({ selector: '0x95d89b41', type: 'string' }),
  decimals: Object.freeze({ selector: '0x313ce567', type: 'decimals' }),
  totalSupplyRaw: Object.freeze({ selector: '0x18160ddd', type: 'uint256' }),
});
const MAX_TEXT_BYTES = 512;
const MAX_TEXT_LENGTH = 128;

function hexBytes(value) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(value)) throw new Error('Malformed hex response.');
  return Buffer.from(value.slice(2), 'hex');
}

function decodeWord(bytes, offset) {
  if (offset < 0 || offset + 32 > bytes.length) throw new Error('Malformed ABI word.');
  return BigInt(`0x${bytes.subarray(offset, offset + 32).toString('hex')}`);
}

function decodeString(value) {
  const bytes = hexBytes(value);
  const offset = Number(decodeWord(bytes, 0));
  if (!Number.isSafeInteger(offset) || offset < 32) throw new Error('Malformed ABI string offset.');
  const length = Number(decodeWord(bytes, offset));
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_TEXT_BYTES || offset + 32 + length > bytes.length) throw new Error('Malformed ABI string length.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 32, offset + 32 + length));
  if (text.length > MAX_TEXT_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error('Unsafe ERC-20 text.');
  return text;
}

function decodeUint256(value) {
  const bytes = hexBytes(value);
  if (bytes.length !== 32) throw new Error('Malformed ABI uint256.');
  return BigInt(`0x${bytes.toString('hex')}`);
}

function unavailableField(error) {
  if (error?.code === 'RPC_CALL_REVERTED') return { status: 'REVERTED' };
  return { status: 'UNAVAILABLE' };
}

async function readField(client, address, blockTag, field) {
  try {
    const raw = await client.call(address, field.selector, blockTag);
    if (field.type === 'string') return { status: 'AVAILABLE', value: decodeString(raw) };
    if (field.type === 'decimals') {
      const value = decodeUint256(raw);
      if (value > 255n) return { status: 'MALFORMED' };
      const numeric = Number(value);
      return { status: 'AVAILABLE', value: numeric, plausible: numeric <= 36 };
    }
    return { status: 'AVAILABLE', value: decodeUint256(raw).toString(10) };
  } catch (error) {
    if (error instanceof RpcReadError) return unavailableField(error);
    return { status: 'MALFORMED' };
  }
}

async function readErc20Fields(client, address, blockTag, { concurrency = 2 } = {}) {
  const entries = Object.entries(ERC20_READS);
  const fields = {};
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const [key, field] = entries[cursor++];
      fields[key] = await readField(client, address, blockTag, field);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return fields;
}

module.exports = { ERC20_READS, MAX_TEXT_BYTES, MAX_TEXT_LENGTH, decodeString, decodeUint256, readErc20Fields };

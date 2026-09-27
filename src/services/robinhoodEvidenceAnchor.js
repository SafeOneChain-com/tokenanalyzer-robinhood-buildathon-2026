'use strict';

const { getAddress, isAddress, keccak256, stringToHex } = require('viem');

const EVIDENCE_DOMAIN = 'TA-EVIDENCE-V1';
const ASSET_KEY_DOMAIN = 'TA-ASSET-KEY-V1';
const EVIDENCE_SCHEMA_VERSION = 1;
const EVIDENCE_ANCHOR_ABI = Object.freeze([
  { type: 'function', name: 'anchorEvidence', stateMutability: 'nonpayable', inputs: [{ name: 'evidenceHash', type: 'bytes32' }, { name: 'assetKey', type: 'bytes32' }, { name: 'schemaVersion', type: 'uint32' }], outputs: [] },
  { type: 'function', name: 'isAnchored', stateMutability: 'view', inputs: [{ name: 'evidenceHash', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'getEvidence', stateMutability: 'view', inputs: [{ name: 'evidenceHash', type: 'bytes32' }], outputs: [{ type: 'bytes32' }, { type: 'uint32' }, { type: 'uint64' }, { type: 'address' }, { type: 'bool' }] },
]);

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function normalizeAddress(value) { if (!isAddress(String(value || ''))) fail('INVALID_EVM_ADDRESS'); return getAddress(String(value)).toLowerCase(); }
function normalizeTimestamp(value) { const date = new Date(String(value || '')); if (!Number.isFinite(date.getTime())) fail('INVALID_OBSERVED_AT'); return date.toISOString(); }
function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail('NON_CANONICAL_NUMBER'); return value; }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') fail('INVALID_CANONICAL_VALUE');
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) fail('INVALID_CANONICAL_KEY');
    result[key] = canonicalize(value[key]);
  }
  return result;
}
function stableJson(value) { return JSON.stringify(canonicalize(value)); }
function normalizeSnapshot(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : fail('INVALID_SNAPSHOT');
  if (source.schemaVersion !== EVIDENCE_SCHEMA_VERSION) fail('UNSUPPORTED_SCHEMA_VERSION');
  if (typeof source.evidenceType !== 'string' || !source.evidenceType) fail('INVALID_EVIDENCE_TYPE');
  if (typeof source.assetNamespace !== 'string' || !source.assetNamespace) fail('INVALID_ASSET_NAMESPACE');
  if (!Number.isSafeInteger(source.assetChainId) || source.assetChainId <= 0) fail('INVALID_ASSET_CHAIN_ID');
  if (!Array.isArray(source.evidenceSources)) fail('INVALID_EVIDENCE_SOURCES');
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidenceType: source.evidenceType,
    assetNamespace: source.assetNamespace,
    assetChainId: source.assetChainId,
    assetIdentifier: normalizeAddress(source.assetIdentifier),
    observedAt: normalizeTimestamp(source.observedAt),
    evidenceSources: source.evidenceSources.map(canonicalize),
    evidencePayload: canonicalize(source.evidencePayload || {}),
  };
}
function assetKey({ assetNamespace, assetChainId, assetIdentifier }) {
  if (typeof assetNamespace !== 'string' || !assetNamespace) fail('INVALID_ASSET_NAMESPACE');
  if (!Number.isSafeInteger(assetChainId) || assetChainId <= 0) fail('INVALID_ASSET_CHAIN_ID');
  return keccak256(stringToHex(`${ASSET_KEY_DOMAIN}\u0000${assetNamespace}\u0000${assetChainId}\u0000${normalizeAddress(assetIdentifier)}`));
}
function createEvidenceSnapshot(input) {
  const snapshot = normalizeSnapshot(input);
  return { snapshot, canonicalEvidenceJson: stableJson(snapshot), assetKey: assetKey(snapshot) };
}
function hashEvidence(input) {
  const prepared = input?.canonicalEvidenceJson ? input : createEvidenceSnapshot(input);
  return { ...prepared, evidenceHash: keccak256(stringToHex(`${EVIDENCE_DOMAIN}\n${prepared.canonicalEvidenceJson}`)) };
}
function buildAnchorCall(input) {
  const evidence = input?.evidenceHash ? input : hashEvidence(input);
  return { abi: EVIDENCE_ANCHOR_ABI, functionName: 'anchorEvidence', args: [evidence.evidenceHash, evidence.assetKey, evidence.snapshot.schemaVersion], ...evidence };
}
async function verifyAnchoredEvidence({ publicClient, contractAddress, evidence }) {
  if (!publicClient?.readContract) fail('PUBLIC_CLIENT_REQUIRED');
  const prepared = evidence?.evidenceHash ? evidence : hashEvidence(evidence);
  const anchored = await publicClient.readContract({ address: normalizeAddress(contractAddress), abi: EVIDENCE_ANCHOR_ABI, functionName: 'isAnchored', args: [prepared.evidenceHash] });
  return { status: anchored ? 'VERIFIED' : 'NOT_ANCHORED', ...prepared };
}

module.exports = { ASSET_KEY_DOMAIN, EVIDENCE_ANCHOR_ABI, EVIDENCE_DOMAIN, EVIDENCE_SCHEMA_VERSION, assetKey, buildAnchorCall, canonicalize, createEvidenceSnapshot, hashEvidence, normalizeSnapshot, stableJson, verifyAnchoredEvidence };

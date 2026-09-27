'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../fixtures/aapl-anchored-snapshot.json');
const { buildAnchorCall, hashEvidence, verifyAnchoredEvidence } = require('../src/services/robinhoodEvidenceAnchor');

test('canonical AAPL evidence is deterministic and chain-bound', async () => {
  const first = hashEvidence(fixture.snapshot);
  const reordered = { ...fixture.snapshot, evidencePayload: { price:null, oracleStatus:'FRESH', multiplier:'1' } };
  assert.equal(first.evidenceHash, hashEvidence(reordered).evidenceHash);
  assert.equal(first.evidenceHash, fixture.expected.evidenceHash);
  assert.equal(first.assetKey, fixture.expected.assetKey);
  assert.notEqual(first.assetKey, hashEvidence({ ...fixture.snapshot, assetChainId:46630 }).assetKey);
  assert.equal(buildAnchorCall(first).functionName, 'anchorEvidence');
  const verified = await verifyAnchoredEvidence({ publicClient:{readContract:async()=>true}, contractAddress:fixture.anchor.contractAddress, evidence:first });
  assert.equal(verified.status, 'VERIFIED');
});

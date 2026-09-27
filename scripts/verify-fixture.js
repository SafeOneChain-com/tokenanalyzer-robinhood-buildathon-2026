'use strict';
const assert = require('node:assert/strict');
const fixture = require('../fixtures/aapl-anchored-snapshot.json');
const { hashEvidence } = require('../src/services/robinhoodEvidenceAnchor');
const result = hashEvidence(fixture.snapshot);
assert.equal(result.evidenceHash, fixture.expected.evidenceHash);
assert.equal(result.assetKey, fixture.expected.assetKey);
console.log('PASS committed AAPL fixture reproduces the anchored evidence hash and asset key.');

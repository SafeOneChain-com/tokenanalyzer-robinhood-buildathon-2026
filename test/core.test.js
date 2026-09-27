'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { listRobinhoodNetworks, resolveRobinhoodNetwork } = require('../src/evm/chainRegistry');
const { createReadClient, ALLOWED_RPC_METHODS } = require('../src/evm/readClient');
const { normalizeAssets } = require('../src/services/robinhoodOfficialAssetRegistry');
const { normalizeDecimal, multiplyDecimals } = require('../src/services/robinhoodDecimal');

test('networks require explicit configuration and mainnet opt-in', () => {
  const env={ROBINHOOD_TESTNET_RPC_URL:'https://rpc.invalid',ROBINHOOD_MAINNET_RPC_URL:'https://main.invalid'};
  assert.deepEqual(listRobinhoodNetworks(env).map(({key,enabled})=>[key,enabled]),[['robinhood-testnet',true],['robinhood-mainnet',false]]);
  assert.equal(resolveRobinhoodNetwork('robinhood-testnet',env).chainId,46630);
  assert.throws(()=>resolveRobinhoodNetwork('robinhood-mainnet',env),{code:'NETWORK_NOT_ENABLED'});
});

test('read client permits read-only JSON-RPC only', async () => {
  const methods=[];
  const client=createReadClient({network:{chainId:46630,rpcUrl:'https://rpc.invalid'},fetchImpl:async(_url,init)=>{const body=JSON.parse(init.body);methods.push(body.method);return {ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:body.id,result:'0xb626'})};}});
  assert.equal(await client.rpc('eth_chainId'),'0xb626');
  await assert.rejects(()=>client.rpc('eth_sendTransaction'),{code:'RPC_METHOD_NOT_ALLOWED'});
  assert(methods.every((method)=>ALLOWED_RPC_METHODS.has(method)));
});

test('official identity uses exact chain and contract matching inputs', () => {
  const records=normalizeAssets({assets:[{id:'asset-aapl',tokenName:'Apple Stock Token',tokenSymbol:'AAPL',deployments:[{chainId:4663,contractAddress:'0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9'}]}]});
  assert(records.has('4663:0xaf3d76f1834a1d425780943c99ea8a608f8a93f9'));
  assert(!records.has('46630:0xaf3d76f1834a1d425780943c99ea8a608f8a93f9'));
});

test('financial decimals avoid floating-point arithmetic', () => {
  assert.equal(normalizeDecimal('1.250000000000000000'),'1.25');
  assert.equal(normalizeDecimal('1e-18'),null);
  assert.equal(multiplyDecimals('123.456789012345678901','1.250000000000000000'),'154.32098626543209862625');
});

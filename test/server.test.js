'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

async function withServer(fn){ const server=createApp({env:{},service:{inspect:async(input)=>({ok:true,input})}}).listen(0,'127.0.0.1'); await new Promise((resolve)=>server.once('listening',resolve)); try{return await fn(`http://127.0.0.1:${server.address().port}`);} finally{await new Promise((resolve)=>server.close(resolve));} }

test('standalone server exposes fixture and rejects extra inspection input',()=>withServer(async(base)=>{
  const fixture=await (await fetch(`${base}/api/evidence/aapl`)).json();
  assert.equal(fixture.anchor.verification,'VERIFIED');
  const invalid=await fetch(`${base}/api/bex/robinhood/assets/inspect`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({network:'x',address:'0x0',rpcUrl:'https://attacker.invalid'})});
  assert.equal(invalid.status,400);
  const home=await (await fetch(base)).text();
  assert.match(home,/Robinhood Buildathon 2026/i);
}));

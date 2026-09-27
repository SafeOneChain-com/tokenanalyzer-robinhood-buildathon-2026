'use strict';

const path = require('node:path');
const express = require('express');
const { listRobinhoodNetworks } = require('./src/evm/chainRegistry');
const { createRobinhoodAssetInspectionService } = require('./src/services/robinhoodAssetInspectionService');
const anchoredFixture = require('./fixtures/aapl-anchored-snapshot.json');

function statusFor(error) {
  return ['INVALID_INPUT', 'UNKNOWN_NETWORK'].includes(error?.code) ? 400
    : error?.code === 'NETWORK_NOT_ENABLED' ? 409
      : 503;
}

function createApp({ env = process.env, service = createRobinhoodAssetInspectionService({ env }) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb', strict: true }));

  app.get('/api/evidence/aapl', (_req, res) => res.json(anchoredFixture));
  app.get('/api/bex/robinhood/networks', (_req, res) => {
    res.json({ networks: listRobinhoodNetworks(env) });
  });
  app.post('/api/bex/robinhood/assets/inspect', async (req, res) => {
    const keys = Object.keys(req.body || {});
    if (keys.some((key) => !['network', 'address'].includes(key))) {
      return res.status(400).json({ ok: false, error: 'INVALID_INPUT' });
    }
    try {
      return res.json(await service.inspect({ network: req.body?.network, address: req.body?.address }));
    } catch (error) {
      return res.status(statusFor(error)).json({ ok: false, error: error?.code || 'INSPECTION_UNAVAILABLE' });
    }
  });
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
  app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`TokenAnalyzer Robinhood competition demo: http://127.0.0.1:${port}`);
  });
}

module.exports = { createApp, statusFor };

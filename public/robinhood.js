/* Gate 1B public UI: local-only, read-only and intentionally analytics-free. */
(function () {
  'use strict';
  const API_ROOT = '/api/bex/robinhood';
  const OFFICIAL_SOURCE_HOSTS = new Set(['api.robinhood.com', 'docs.robinhood.com']);
  const MAINNET_DEMOS = Object.freeze([
    { label: 'Load AAPL mainnet example', address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9' },
    { label: 'Load CRM partial example', address: '0xd95B44124e475743a7589e68F3D74008A5536D44' },
  ]);
  const text = (value, fallback = 'n/a') => value === null || value === undefined || value === '' ? fallback : String(value);

  function isOfficialSource(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && OFFICIAL_SOURCE_HOSTS.has(url.hostname); } catch (_) { return false; }
  }
  function element(name, content, className) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }
  function statusText(identity) {
    return identity?.official === true ? 'Official Robinhood Stock Token' : 'Not confirmed as an official Robinhood Stock Token';
  }
  function fieldValue(field) {
    return field?.status === 'AVAILABLE' ? text(field.value) : 'n/a';
  }
  function publicAddress(address) {
    const wrapper = element('div');
    if (window.BEXPublicValue?.html) {
      wrapper.innerHTML = window.BEXPublicValue.html({ fullValue: address, displayValue: address, valueType: 'evidence', label: 'contract address' });
      return wrapper.firstElementChild;
    }
    return element('code', address);
  }
  function addKeyValue(parent, label, value) {
    const row = element('div');
    row.append(element('dt', label));
    const detail = element('dd');
    if (value instanceof Node) detail.append(value); else detail.textContent = text(value);
    row.append(detail); parent.append(row);
  }
  function card(title, wide) {
    const section = element('section', undefined, `section-card robinhood-result-card${wide ? ' robinhood-result-card--wide' : ''}`);
    section.append(element('h2', title)); return section;
  }
  function sourceStatus(value) {
    const node = element('span', value || 'UNAVAILABLE', 'robinhood-source-status'); node.dataset.status = value || 'UNAVAILABLE'; return node;
  }
  function appendStockTokenIntegrity(root, integrity) {
    if (!integrity || !integrity.asset) return;
    const grid = element('div', undefined, 'robinhood-result-grid robinhood-integrity-grid');
    const identity = card('Stock Token Integrity: Underlying & Identity'); const identityValues = element('dl', undefined, 'robinhood-kv');
    addKeyValue(identityValues, 'Asset ID (uid)', integrity.asset.id); addKeyValue(identityValues, 'Stock Token', integrity.asset.symbol);
    addKeyValue(identityValues, 'Asset name', integrity.asset.name); addKeyValue(identityValues, 'Asset status', integrity.asset.status);
    addKeyValue(identityValues, 'Trading capabilities', integrity.tradingCapabilities ? Object.entries(integrity.tradingCapabilities).map(([key, value]) => `${key}: ${value ? 'yes' : 'no'}`).join(', ') : 'n/a');
    identity.append(identityValues); identity.append(element('p', 'This identity is based on the exact official Robinhood Chain contract match. It is separate from self-reported ERC-20 metadata.', 'robinhood-section-note')); grid.append(identity);

    const multiplier = card('Stock Token Integrity: Multiplier'); const multiplierValues = element('dl', undefined, 'robinhood-kv'); const data = integrity.multiplier || {};
    addKeyValue(multiplierValues, 'Current multiplier', data.current); addKeyValue(multiplierValues, 'Onchain uiMultiplier()', data.onchain);
    addKeyValue(multiplierValues, 'Comparison', data.comparison); addKeyValue(multiplierValues, 'Pending multiplier', data.pending);
    addKeyValue(multiplierValues, 'Pending effective at', data.pendingEffectiveAt); multiplier.append(multiplierValues);
    multiplier.append(element('p', 'The multiplier is the shares-per-Stock-Token ratio used for corporate actions. A pending multiplier is not used as the active multiplier.', 'robinhood-section-note')); grid.append(multiplier);

    const actions = card('Stock Token Integrity: Corporate Actions');
    if (Array.isArray(integrity.corporateActions) && integrity.corporateActions.length) {
      const list = element('ul', undefined, 'robinhood-evidence-list'); integrity.corporateActions.forEach((action) => {
        const item = element('li', `${text(action.type)} · ${text(action.status)} · ${text(action.processDate)}`);
        if (action.details) item.append(element('span', ` · ${Object.entries(action.details).filter(([, value]) => value !== null).map(([key, value]) => `${key}: ${value}`).join(', ')}`)); list.append(item);
      }); actions.append(list);
    } else actions.append(element('p', 'No matching corporate actions are currently available from the official API.', 'robinhood-neutral-note'));
    grid.append(actions);

    const price = card('Stock Token Integrity: Reference Price'); const priceValues = element('dl', undefined, 'robinhood-kv'); const reference = integrity.referencePrice || {};
    addKeyValue(priceValues, 'Currency', reference.currency); addKeyValue(priceValues, 'Underlying bid', reference.underlyingBid); addKeyValue(priceValues, 'Underlying ask', reference.underlyingAsk);
    addKeyValue(priceValues, 'Derived token-equivalent bid', reference.tokenEquivalentBid); addKeyValue(priceValues, 'Derived token-equivalent ask', reference.tokenEquivalentAsk);
    addKeyValue(priceValues, 'Generated at', reference.generatedAt); addKeyValue(priceValues, 'Trading halt', reference.tradingHalt === true ? 'Reported' : reference.tradingHalt === false ? 'Not reported' : 'n/a'); price.append(priceValues);
    price.append(element('p', 'Reference bid and ask are underlying-market values. Token-equivalent values are derived with the current multiplier; neither is a DEX price or an onchain price oracle.', 'robinhood-section-note')); grid.append(price);

    const evidence = card('Stock Token Integrity: Evidence Summary', true); const evidenceList = element('ul', undefined, 'robinhood-evidence-list');
    (integrity.evidence || []).forEach((entry) => evidenceList.append(element('li', `${text(entry.state)} · ${text(entry.source)}`)));
    if (evidenceList.children.length) evidence.append(evidenceList); else evidence.append(element('p', 'Insufficient evidence is available for this additional integrity view.', 'robinhood-neutral-note'));
    grid.append(evidence); root.append(grid);
    appendPriceIntegrity(root, integrity.priceIntegrity);
  }
  function appendPriceIntegrity(root, integrity) {
    if (!integrity) return;
    const grid = element('div', undefined, 'robinhood-result-grid robinhood-integrity-grid');
    const summary = card('Price Evidence', true); const summaryValues = element('dl', undefined, 'robinhood-kv');
    addKeyValue(summaryValues, 'Overall', sourceStatus(integrity.overall?.status || integrity.status)); addKeyValue(summaryValues, 'Evidence consistency', sourceStatus(integrity.overall?.consistency)); summary.append(summaryValues);
    summary.append(element('p', 'Evidence availability is assessed independently for each source and asset. Missing evidence is reported and never fabricated.', 'robinhood-section-note')); grid.append(summary);
    const sources = integrity.priceSources || {}; const ref = sources.robinhoodReference || {}; const reference = card('Price Evidence: Robinhood Reference'); const referenceValues = element('dl', undefined, 'robinhood-kv');
    addKeyValue(referenceValues, 'Status', sourceStatus(ref.status)); addKeyValue(referenceValues, 'Derived token-equivalent bid', ref.bid); addKeyValue(referenceValues, 'Derived token-equivalent ask', ref.ask); addKeyValue(referenceValues, 'Value basis', ref.valueBasis); addKeyValue(referenceValues, 'Updated', ref.sourceDataAt); addKeyValue(referenceValues, 'Freshness', ref.freshness); reference.append(referenceValues); reference.append(element('p', 'Derived from Robinhood underlying reference × currentMultiplier. It is not an observed DEX market price.', 'robinhood-section-note')); grid.append(reference);
    const oracleSource = sources.chainlinkOracle || {}; const oracle = card('Price Evidence: Chainlink Oracle'); const oracleValues = element('dl', undefined, 'robinhood-kv');
    addKeyValue(oracleValues, 'Status', sourceStatus(oracleSource.status)); addKeyValue(oracleValues, 'Price per Stock Token', oracleSource.value); addKeyValue(oracleValues, 'Value basis', oracleSource.valueBasis); addKeyValue(oracleValues, 'Updated', oracleSource.sourceDataAt); addKeyValue(oracleValues, 'Feed freshness', oracleSource.freshness); addKeyValue(oracleValues, 'Oracle paused', integrity.oraclePaused?.status); if (oracleSource.feed?.proxyAddress) addKeyValue(oracleValues, 'Feed proxy', publicAddress(oracleSource.feed.proxyAddress)); oracle.append(oracleValues);
    if (oracleSource.status === 'OFFICIAL_FEED_MAPPING_UNAVAILABLE') oracle.append(element('p', 'Official feed mapping currently unavailable. TokenAnalyzer only uses feed addresses that can be verified from official Chainlink sources.', 'robinhood-neutral-note'));
    else oracle.append(element('p', 'The Chainlink value is already per Stock Token. TokenAnalyzer does not apply the multiplier a second time.', 'robinhood-section-note')); grid.append(oracle);
    const marketSource = sources.observedMarket || {}; const market = card('Price Evidence: Observed Market'); const marketValues = element('dl', undefined, 'robinhood-kv');
    addKeyValue(marketValues, 'Status', sourceStatus(marketSource.status)); addKeyValue(marketValues, 'Observation', marketSource.unavailableReason); addKeyValue(marketValues, 'Venue', marketSource.venue); addKeyValue(marketValues, 'Pool', marketSource.pool); addKeyValue(marketValues, 'Observed AMM market price', marketSource.value); market.append(marketValues); grid.append(market);
    const sequencer = card('Sequencer uptime verification', true); const sequencerValues = element('dl', undefined, 'robinhood-kv'); addKeyValue(sequencerValues, 'Status', sourceStatus(integrity.sequencer?.status)); sequencer.append(sequencerValues);
    if (integrity.sequencer?.status === 'SEQUENCER_UPTIME_FEED_NOT_PUBLISHED') sequencer.append(element('p', 'Not available. Chainlink currently does not publish a Sequencer Uptime Feed for Robinhood Chain. This check is not included in the current evidence set.', 'robinhood-neutral-note'));
    else sequencer.append(element('p', text(integrity.sequencer?.unavailableReason), 'robinhood-section-note')); grid.append(sequencer); root.append(grid);
  }
  function renderResult(result) {
    const root = document.getElementById('robinhoodResults');
    root.replaceChildren();
    const identity = result.assetIdentity || { classification: result.ok ? 'INSPECTION_PARTIAL' : 'INSPECTION_ERROR', official: null, evidence: [], verificationStatus: 'PARTIAL_EVIDENCE' };
    const grid = element('div', undefined, 'robinhood-result-grid');
    const identityCard = card('Asset Identity');
    const identityValues = element('dl', undefined, 'robinhood-kv');
    const classification = element('span', identity.classification || 'INSPECTION_PARTIAL', 'robinhood-classification');
    classification.dataset.classification = identity.classification || 'INSPECTION_PARTIAL';
    addKeyValue(identityValues, 'Classification', classification);
    addKeyValue(identityValues, 'Official status', statusText(identity));
    if (identity.canonicalAsset) {
      addKeyValue(identityValues, 'Canonical name', identity.canonicalAsset.displayName);
      addKeyValue(identityValues, 'Symbol', identity.canonicalAsset.symbol);
      addKeyValue(identityValues, 'Underlying ticker', identity.canonicalAsset.underlyingTicker);
    }
    identityCard.append(identityValues);
    if (identity.official !== true) identityCard.append(element('p', 'Official Robinhood Stock Token identity could not be confirmed.', 'robinhood-neutral-note'));
    grid.append(identityCard);

    const contractCard = card('Contract'); const contractValues = element('dl', undefined, 'robinhood-kv');
    addKeyValue(contractValues, 'Address', result.contract?.address ? publicAddress(result.contract.address) : 'n/a');
    addKeyValue(contractValues, 'Network', result.network?.name);
    addKeyValue(contractValues, 'Chain ID', result.network?.chainId);
    addKeyValue(contractValues, 'Bytecode present', result.contract?.hasCode === true ? 'Yes' : result.contract?.hasCode === false ? 'No' : 'n/a');
    contractCard.append(contractValues); grid.append(contractCard);

    const tokenCard = card('Token Data'); const tokenValues = element('dl', undefined, 'robinhood-kv');
    const fields = result.tokenStandardObservation?.fields || {};
    addKeyValue(tokenValues, 'name()', fieldValue(fields.name)); addKeyValue(tokenValues, 'symbol()', fieldValue(fields.symbol));
    addKeyValue(tokenValues, 'decimals()', fieldValue(fields.decimals)); addKeyValue(tokenValues, 'totalSupply()', fieldValue(fields.totalSupplyRaw));
    tokenCard.append(tokenValues); tokenCard.append(element('p', 'Contract metadata is self-reported and does not prove issuer identity.', 'robinhood-section-note')); grid.append(tokenCard);

    const evidenceCard = card('Evidence'); const evidence = Array.isArray(identity.evidence) ? identity.evidence : [];
    if (evidence.length) {
      const list = element('ul', undefined, 'robinhood-evidence-list');
      evidence.forEach((entry) => {
        const item = element('li'); item.append(element('strong', 'Official contract registry: '));
        if (isOfficialSource(entry.source)) { const link = element('a', entry.source); link.href = entry.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link); }
        else item.append(element('span', 'Official source reference unavailable'));
        item.append(element('span', ` · exact contract match: ${text(entry.matchedAddress)} · checked ${text(entry.checkedAt)}`)); list.append(item);
      });
      evidenceCard.append(list);
    } else evidenceCard.append(element('p', 'No official contract-match evidence is available for this result.', 'robinhood-neutral-note'));
    if (result.block) evidenceCard.append(element('p', `Technical read block: ${text(result.block.number)} · checked ${text(result.inspection?.checkedAt)}`, 'robinhood-section-note'));
    grid.append(evidenceCard);

    const verification = card('Verification Status', true); const verificationValues = element('dl', undefined, 'robinhood-kv');
    addKeyValue(verificationValues, 'Evidence status', identity.verificationStatus || 'PARTIAL_EVIDENCE');
    addKeyValue(verificationValues, 'Technical inspection', result.inspection?.status || 'UNAVAILABLE'); verification.append(verificationValues);
    verification.append(element('p', 'Verification means the contract identity was matched against documented evidence. It is not an investment recommendation or general security certification.', 'robinhood-section-note'));
    grid.append(verification); root.append(grid);
    if (identity.classification === 'OFFICIAL_STOCK_TOKEN') appendStockTokenIntegrity(root, result.stockTokenIntegrity);
  }
  function renderError(code) {
    const root = document.getElementById('robinhoodResults'); root.replaceChildren();
    const state = card('Verification unavailable', true); state.append(element('p', errorMessage(code), 'robinhood-neutral-note')); root.append(state);
  }
  function errorMessage(code) {
    const messages = {
      INVALID_INPUT: 'Enter a valid EVM contract address and choose an enabled network.', NETWORK_NOT_ENABLED: 'This network is not enabled for public verification.',
      RPC_RATE_LIMITED: 'The network provider is temporarily rate limited. Please try again later.', RPC_TIMEOUT: 'The network provider timed out. Please try again later.',
    };
    return messages[code] || 'Verification is temporarily unavailable. No identity conclusion was made.';
  }
  function setStatus(message, state) { const target = document.getElementById('robinhoodFormStatus'); target.textContent = message || ''; target.dataset.state = state || ''; }
  function setLoading(loading) { const button = document.getElementById('robinhoodVerify'); button.disabled = loading; button.textContent = loading ? 'Verifying…' : 'Verify Asset'; }
  async function loadNetworks() {
    const select = document.getElementById('robinhoodNetwork');
    try {
      const response = await fetch(`${API_ROOT}/networks`, { credentials: 'same-origin' }); const body = await response.json();
      const enabled = (body.networks || []).filter((network) => network.enabled === true);
      select.replaceChildren();
      enabled.forEach((network) => { const option = element('option', network.name); option.value = network.key; select.append(option); });
      const mainnet = enabled.find((network) => network.key === 'robinhood-mainnet'); const mode = document.getElementById('robinhoodNetworkMode');
      mode.textContent = mainnet ? 'Robinhood Chain Mainnet and Testnet enabled for read-only verification' : 'Robinhood Chain Testnet enabled for read-only verification';
      renderMainnetDemos(Boolean(mainnet));
      if (!enabled.length) { const option = element('option', 'No Robinhood Chain network is currently enabled'); option.value = ''; select.append(option); select.disabled = true; document.getElementById('robinhoodVerify').disabled = true; setStatus('No Robinhood Chain network is currently enabled.', 'error'); }
    } catch (_) { select.replaceChildren(element('option', 'Network availability could not be loaded')); select.disabled = true; document.getElementById('robinhoodVerify').disabled = true; setStatus('Network availability could not be loaded.', 'error'); }
  }
  function renderMainnetDemos(mainnetEnabled) {
    const root = document.getElementById('robinhoodDemoAssets'); root.replaceChildren(); root.hidden = !mainnetEnabled;
    if (!mainnetEnabled) return;
    MAINNET_DEMOS.forEach((demo) => { const button = element('button', demo.label, 'btn secondary'); button.type = 'button'; button.dataset.robinhoodDemo = demo.label.includes('AAPL') ? 'AAPL' : 'CRM'; button.addEventListener('click', () => { document.getElementById('robinhoodNetwork').value = 'robinhood-mainnet'; document.getElementById('robinhoodAddress').value = demo.address; document.getElementById('robinhoodAddress').focus(); setStatus('Example loaded. Select Verify Asset to run a read-only check.', ''); }); root.append(button); });
  }
  async function submit(event) {
    event.preventDefault(); const network = document.getElementById('robinhoodNetwork').value; const address = document.getElementById('robinhoodAddress').value.trim();
    if (!network || !address) { setStatus('Enter a contract address and choose an enabled network.', 'error'); return; }
    setLoading(true); setStatus('Reading public contract data and official registry evidence…', 'loading');
    try {
      const response = await fetch(`${API_ROOT}/assets/inspect`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ network, address }) });
      const body = await response.json(); if (!response.ok || !body.ok) { renderError(body?.error); setStatus(errorMessage(body?.error), 'error'); return; }
      renderResult(body); setStatus('Verification result loaded.', 'success');
    } catch (_) { renderError('INSPECTION_UNAVAILABLE'); setStatus(errorMessage('INSPECTION_UNAVAILABLE'), 'error'); }
    finally { setLoading(false); }
  }
  function initTheme() {
    const root = document.documentElement; const toggle = document.querySelector('.bex-toggle'); const key = 'tokenops_theme';
    const setTheme = (theme, persist) => { const next = theme === 'dark' ? 'dark' : 'light'; root.dataset.theme = next; toggle.textContent = next === 'dark' ? 'Light mode' : 'Dark mode'; toggle.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} mode`); if (persist) try { localStorage.setItem(key, next); } catch (_) {} };
    let stored = null; try { stored = localStorage.getItem(key); } catch (_) {} setTheme(stored || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), false);
    toggle.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
  }
  window.RobinhoodAssetVerification = Object.freeze({ errorMessage, isOfficialSource, statusText });
  document.addEventListener('DOMContentLoaded', () => { initTheme(); document.getElementById('robinhoodVerificationForm').addEventListener('submit', submit); loadNetworks(); });
})();

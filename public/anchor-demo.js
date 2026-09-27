(async () => {
  const root = document.getElementById('anchorEvidence');
  const labels = { evidenceHash:'Evidence hash', assetKey:'Asset key', contractAddress:'Anchor contract', anchorTransaction:'Anchor transaction', anchorBlock:'Anchor block', verification:'Verification' };
  try {
    const response = await fetch('/api/evidence/aapl');
    const fixture = await response.json();
    const values = { evidenceHash:fixture.expected.evidenceHash, assetKey:fixture.expected.assetKey, contractAddress:fixture.anchor.contractAddress, anchorTransaction:fixture.anchor.transactionHash, anchorBlock:fixture.anchor.blockNumber, verification:fixture.anchor.verification };
    const list = document.createElement('dl'); list.className = 'anchor-grid';
    Object.entries(values).forEach(([key,value]) => { const item=document.createElement('div'); item.className='anchor-item'; const term=document.createElement('dt'); term.textContent=labels[key]; const detail=document.createElement('dd'); detail.textContent=String(value); item.append(term,detail); list.append(item); });
    root.replaceWith(list);
  } catch (_) { root.textContent = 'The committed evidence fixture could not be loaded.'; }
})();

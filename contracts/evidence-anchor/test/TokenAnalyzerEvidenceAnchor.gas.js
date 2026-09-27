describe('TokenAnalyzerEvidenceAnchor gas', function () {
  it('reports deployment and anchor gas', async function () { const [deployer] = await ethers.getSigners(); const Factory = await ethers.getContractFactory('TokenAnalyzerEvidenceAnchor'); const anchor = await Factory.deploy(deployer.address); const deployment = await anchor.deploymentTransaction().wait(); const write = await (await anchor.anchorEvidence(`0x${'33'.repeat(32)}`, `0x${'44'.repeat(32)}`, 1)).wait(); console.log(`GAS_DEPLOYMENT=${deployment.gasUsed}`); console.log(`GAS_ANCHOR_EVIDENCE=${write.gasUsed}`); });
});

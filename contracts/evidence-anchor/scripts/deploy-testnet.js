const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error('ROBINHOOD_TESTNET_EVIDENCE_ANCHOR_PRIVATE_KEY is required.');
  const Anchor = await hre.ethers.getContractFactory('TokenAnalyzerEvidenceAnchor');
  const anchor = await Anchor.deploy(deployer.address);
  const deployment = anchor.deploymentTransaction();
  const receipt = await deployment.wait();
  console.log(`CONTRACT_ADDRESS=${await anchor.getAddress()}`);
  console.log(`DEPLOYER=${deployer.address}`);
  console.log(`DEPLOYMENT_TX=${deployment.hash}`);
  console.log(`DEPLOYMENT_BLOCK=${receipt.blockNumber}`);
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });

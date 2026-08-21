// scripts/deploy.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // ── 1. RiskOracle ────────────────────────────────────────────────────────────
  // ORACLE_ADDRESS is the authorized off-chain relayer that signs risk scores.
  // For local testing, we use the first Hardhat account.
  // For Amoy testnet, override this via the ORACLE_RELAYER_ADDRESS env variable.
  const oracleSignerAddress = process.env.ORACLE_RELAYER_ADDRESS || deployer.address;

  const RiskOracle = await ethers.getContractFactory("RiskOracle");
  const riskOracle = await RiskOracle.deploy(oracleSignerAddress);
  await riskOracle.waitForDeployment();
  const riskOracleAddress = await riskOracle.getAddress();
  console.log("RiskOracle deployed to:", riskOracleAddress);

  // ── 2. PolicyManager ──────────────────────────────────────────────────────────
  const PolicyManager = await ethers.getContractFactory("PolicyManager");
  const policyManager = await PolicyManager.deploy(riskOracleAddress);
  await policyManager.waitForDeployment();
  const policyManagerAddress = await policyManager.getAddress();
  console.log("PolicyManager deployed to:", policyManagerAddress);

  // ── 3. Write addresses to deployed-addresses.json ────────────────────────────
  // The frontend and oracle relayer agents read this file.
  // Key names are fixed: riskOracleAddress, policyManagerAddress.
  const outputPath = path.join(__dirname, "..", "deployed-addresses.json");
  const output = {
    riskOracleAddress,
    policyManagerAddress,
    network: (await ethers.provider.getNetwork()).name,
    oracleSignerAddress,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("Deployed addresses written to:", outputPath);

  // ── 4. Write addresses and ABIs to frontend/src/contracts ────────────────
  const frontendContractsDir = path.join(__dirname, "..", "..", "frontend", "src", "contracts");
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }
  
  // Write deployed addresses
  fs.writeFileSync(
    path.join(frontendContractsDir, "deployed-addresses.json"),
    JSON.stringify(output, null, 2)
  );

  // Write ABIs
  const riskOracleArtifact = await hre.artifacts.readArtifact("RiskOracle");
  const policyManagerArtifact = await hre.artifacts.readArtifact("PolicyManager");
  
  fs.writeFileSync(
    path.join(frontendContractsDir, "RiskOracle.json"),
    JSON.stringify({ abi: riskOracleArtifact.abi }, null, 2)
  );
  fs.writeFileSync(
    path.join(frontendContractsDir, "PolicyManager.json"),
    JSON.stringify({ abi: policyManagerArtifact.abi }, null, 2)
  );
  console.log("Deployed addresses and ABIs written to frontend/src/contracts");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

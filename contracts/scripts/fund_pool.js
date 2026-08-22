const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const addrsPath = path.resolve(__dirname, "../../frontend/src/contracts/deployed-addresses.json");
  const addrs = JSON.parse(fs.readFileSync(addrsPath, "utf8"));
  const pmAddress = addrs.policyManagerAddress;

  const amount = ethers.parseEther("5000.0"); // 5,000 ETH for liquidity pool

  const [funder] = await ethers.getSigners();
  console.log(`Funding PolicyManager at ${pmAddress} with 10,000 ETH...`);

  const tx = await funder.sendTransaction({
    to: pmAddress,
    value: amount,
  });

  await tx.wait();
  console.log("PolicyManager is now fully funded!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

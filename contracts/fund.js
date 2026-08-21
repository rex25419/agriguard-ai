const { ethers } = require("hardhat");
const fs = require("fs");
async function main() {
  const addrs = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"));
  const pmAddress = addrs.policyManagerAddress;
  const [deployer] = await ethers.getSigners();
  const tx = await deployer.sendTransaction({
    to: pmAddress,
    value: ethers.parseEther("1000.0")
  });
  await tx.wait();
  console.log("Funded PolicyManager with 1000 ETH");
}
main().catch(console.error);

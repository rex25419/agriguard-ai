const { ethers } = require("hardhat");

async function main() {
  const targetAddress = "0xB7c4070251eAb49aEA9E9888D3f56dE41A737846";
  const amount = ethers.parseEther("100.0"); // 100 ETH

  const [sender] = await ethers.getSigners();
  console.log(`Sending 100 ETH from ${sender.address} to ${targetAddress}...`);

  const tx = await sender.sendTransaction({
    to: targetAddress,
    value: amount,
  });

  await tx.wait();
  console.log("Transfer complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

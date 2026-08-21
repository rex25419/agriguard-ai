import { ethers } from "ethers";
import fs from "fs";
import { exec } from "child_process";

async function main() {
  console.log("Starting verification...");

  // Use the standard Hardhat network URL
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  
  // Use the default first account from Hardhat node
  const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deploying MockContract...");
  const contractJson = JSON.parse(fs.readFileSync("./artifacts/contracts/MockContract.sol/MockContract.json", "utf8"));
  
  const factory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  console.log(`MockContract deployed to: ${contractAddress}`);

  // Update .env
  let envConfig = fs.readFileSync(".env", "utf8");
  envConfig = envConfig.replace(/CONTRACT_ADDRESS=.*/, `CONTRACT_ADDRESS=${contractAddress}`);
  fs.writeFileSync(".env", envConfig);
  console.log("Updated .env with CONTRACT_ADDRESS.");

  // Also update abi.json to match the actual ABI (though our mock ABI is likely correct)
  fs.writeFileSync("abi.json", JSON.stringify(contractJson.abi, null, 2));
  console.log("Updated abi.json with actual compiled ABI.");

  console.log("Starting relayer.js (this will run the initial sync)...");
  
  const relayerProcess = exec("node relayer.js");

  relayerProcess.stdout.on("data", (data) => {
    process.stdout.write(`[Relayer] ${data}`);
    // If it prints "Cron scheduler started", we know the initial sync is done.
    if (data.includes("Cron scheduler started")) {
      console.log("Verification complete! Initial sync was successful.");
      relayerProcess.kill();
      process.exit(0);
    }
  });

  relayerProcess.stderr.on("data", (data) => {
    process.stderr.write(`[Relayer ERROR] ${data}`);
  });

  relayerProcess.on("close", (code) => {
    console.log(`Relayer process exited with code ${code}`);
    process.exit(code);
  });
}

main().catch(console.error);

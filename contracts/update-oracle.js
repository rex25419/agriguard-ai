import fs from "fs";
import { ethers } from "ethers";

const addrs = JSON.parse(fs.readFileSync("./deployed-addresses.json", "utf8"));
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const wallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

const abi = JSON.parse(fs.readFileSync("../oracle/abi.json", "utf8"));
const contract = new ethers.Contract(addrs.riskOracleAddress, abi, wallet);

async function main() {
  const districtId = 1;
  const riskScore = 75;
  const timestamp = Math.floor(Date.now() / 1000) + 1; // ensure strict increase
  
  const messageHash = ethers.solidityPackedKeccak256(
    ["uint256", "uint8", "uint256"],
    [districtId, riskScore, timestamp]
  );
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));
  
  const tx = await contract.submitRiskScore(districtId, riskScore, timestamp, signature);
  await tx.wait();
  console.log(`Submitted risk score ${riskScore} for district ${districtId}`);
}
main();

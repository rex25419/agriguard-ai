import { ethers } from "ethers";
import { signPayload, initEthers } from "./relayer.js";

async function testSigning() {
  console.log("=== Testing Signing Logic ===");
  
  // Set a dummy private key in env for the test
  await initEthers(); 
  
  const dummyWallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY);
  const expectedAddress = await dummyWallet.getAddress();
  
  console.log(`Expected Signer Address: ${expectedAddress}`);
  
  const districtId = "5";
  const riskScore = 85;
  const timestamp = Math.floor(Date.now() / 1000);
  
  console.log(`Payload: districtId=${districtId}, riskScore=${riskScore}, timestamp=${timestamp}`);
  
  // Hash payload exactly as the contract would
  const messageHash = ethers.solidityPackedKeccak256(
    ["uint256", "uint8", "uint256"],
    [districtId, riskScore, timestamp]
  );
  
  console.log(`Message Hash: ${messageHash}`);
  
  // Generate signature using relayer's function
  const signature = await signPayload(districtId, riskScore, timestamp);
  console.log(`Signature: ${signature}`);
  
  // Recover signer from signature and hash
  // Note: ethers.verifyMessage expects the raw bytes or string (not the hash bytes directly, but it prefixes it).
  // Wait, if signMessage expects bytes of the hash: wallet.signMessage(ethers.getBytes(messageHash))
  // Then verifyMessage expects the same: ethers.verifyMessage(ethers.getBytes(messageHash), signature)
  const recoveredAddress = ethers.verifyMessage(ethers.getBytes(messageHash), signature);
  
  console.log(`Recovered Address: ${recoveredAddress}`);
  
  if (recoveredAddress === expectedAddress) {
    console.log("✅ SUCCESS: Recovered address matches the signer!");
  } else {
    console.error("❌ FAILURE: Recovered address does not match!");
    process.exit(1);
  }
}

testSigning().catch(console.error);

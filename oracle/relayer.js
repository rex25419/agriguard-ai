import "dotenv/config";
import { ethers } from "ethers";
import axios from "axios";
import fs from "fs";
import path from "path";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
let CONTRACT_ADDRESS = process.env.RISK_ORACLE_ADDRESS;
if (!CONTRACT_ADDRESS) {
  try {
    const addrsPath = new URL("../contracts/deployed-addresses.json", import.meta.url);
    const addrs = JSON.parse(fs.readFileSync(addrsPath, "utf8"));
    CONTRACT_ADDRESS = addrs.riskOracleAddress;
  } catch (err) {
    console.warn("Could not load deployed-addresses.json", err.message);
  }
}
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "10000", 10);

const LOG_FILE = path.resolve("./submissions.log");

// Load ABI
const abiPath = new URL("./abi.json", import.meta.url);
const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));

// Define the 10 districts
const DISTRICT_IDS = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

// State for Outlier Guard
// Maps districtId -> { lastSubmittedScore: number, pendingOutlier: number, consecutiveCount: number }
const districtStates = {};
DISTRICT_IDS.forEach(id => {
  districtStates[id] = {
    lastSubmittedScore: null,
    pendingOutlier: null,
    consecutiveCount: 0
  };
});

let provider;
let wallet;
let contract;

function logSubmission(districtId, riskScore, txHash) {
  const msg = `[${new Date().toISOString()}] Submitted Risk Score for District ${districtId}: ${riskScore} (TX: ${txHash})\n`;
  console.log(msg.trim());
  fs.appendFileSync(LOG_FILE, msg);
}

function logWarning(msg) {
  const formatted = `[WARN] [${new Date().toISOString()}] ${msg}\n`;
  console.warn(formatted.trim());
  fs.appendFileSync(LOG_FILE, formatted);
}

async function initEthers() {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  const baseWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  wallet = new ethers.NonceManager(baseWallet);
  
  // Use a fallback address if the env is not set yet (for dry testing without a real node)
  const address = CONTRACT_ADDRESS || ethers.ZeroAddress;
  contract = new ethers.Contract(address, abi, wallet);
  console.log(`Connected to blockchain. Relayer address: ${await wallet.getAddress()}`);
}

async function fetchLatestReading(districtId) {
  try {
    const url = `${ML_SERVICE_URL}/districts/${districtId}/history`;
    const response = await axios.get(url);
    
    // Support either an array of readings or a single latest reading object
    const data = response.data;
    let reading = Array.isArray(data) ? data[data.length - 1] : data;
    
    // Fallback parsing if the ML service structure differs slightly
    if (!reading || typeof reading.riskScore !== 'number') {
      throw new Error(`Unexpected ML response format for district ${districtId}`);
    }
    
    return {
      riskScore: reading.riskScore,
      timestamp: reading.timestamp || Math.floor(Date.now() / 1000)
    };
  } catch (error) {
    console.error(`Error fetching data for district ${districtId}:`, error.message);
    return null;
  }
}

async function signPayload(districtId, riskScore, timestamp) {
  // keccak256(abi.encodePacked(districtId, riskScore, timestamp))
  const messageHash = ethers.solidityPackedKeccak256(
    ["uint256", "uint8", "uint256"],
    [districtId, riskScore, timestamp]
  );
  
  // Sign the raw bytes of the hash
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));
  return signature;
}

async function processDistrict(districtId) {
  const reading = await fetchLatestReading(districtId);
  if (!reading) return;

  const { riskScore, timestamp } = reading;
  const state = districtStates[districtId];

  // ==========================================
  // OUTLIER GUARD
  // A hackathon simplification replacing true multi-oracle consensus (Chainlink/CRE)
  // If the score jumps >40 points abruptly, require it to persist for 2 consecutive polls.
  // ==========================================
  if (state.lastSubmittedScore !== null) {
    const jump = Math.abs(riskScore - state.lastSubmittedScore);
    if (jump > 40) {
      if (state.pendingOutlier === riskScore) {
        state.consecutiveCount += 1;
      } else {
        state.pendingOutlier = riskScore;
        state.consecutiveCount = 1;
      }

      if (state.consecutiveCount < 2) {
        logWarning(`Outlier detected for District ${districtId} (Jump: ${jump}, Score: ${riskScore}). Waiting for 2 consecutive polls.`);
        return; // Halt submission for this poll
      } else {
        logWarning(`Outlier persisted for District ${districtId}. Proceeding with submission.`);
      }
    }
  }

  // Reset outlier state since we either didn't trigger it, or it passed the guard
  state.pendingOutlier = null;
  state.consecutiveCount = 0;

  try {
    const signature = await signPayload(districtId, riskScore, timestamp);
    
    // If CONTRACT_ADDRESS is not set (e.g. testing phase), just log the signature.
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === ethers.ZeroAddress) {
      logWarning(`RiskOracle address not configured. Would have submitted: district=${districtId}, score=${riskScore}, sig=${signature}`);
      state.lastSubmittedScore = riskScore;
      return;
    }

    const tx = await contract.submitRiskScore(districtId, riskScore, timestamp, signature);
    const receipt = await tx.wait();
    
    state.lastSubmittedScore = riskScore;
    logSubmission(districtId, riskScore, receipt.hash);
  } catch (error) {
    console.error(`Error submitting risk score for district ${districtId}:`, error.message);
  }
}

async function poll() {
  console.log(`[${new Date().toISOString()}] Polling ML service for risk scores...`);
  for (const districtId of DISTRICT_IDS) {
    await processDistrict(districtId);
  }
}

async function main() {
  console.log("Starting AgriGuard AI Oracle Relayer...");
  if (!PRIVATE_KEY) {
    console.error("Missing ORACLE_PRIVATE_KEY in .env");
    process.exit(1);
  }

  await initEthers();
  
  // Initial run
  await poll();

  // Schedule loop
  setInterval(poll, POLL_INTERVAL_MS);
}

// Export for testability (e.g., in demo-mode.js or tests)
export { 
  signPayload, 
  processDistrict, 
  districtStates, 
  initEthers, 
  logSubmission,
  logWarning,
  DISTRICT_IDS
};

// Only run main if executed directly
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch(console.error);
}

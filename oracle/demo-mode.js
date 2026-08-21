import "dotenv/config";
import fs from "fs";
import path from "path";
import { signPayload, districtStates, initEthers, logSubmission, logWarning, DISTRICT_IDS } from "./relayer.js";
import { ethers } from "ethers";

const SEQUENCE_PATH = path.resolve("../ml/demo_sequence.json");
const DEMO_INTERVAL_MS = 5000; // 5 seconds
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

async function runDemo() {
  console.log("=== Starting AgriGuard AI Oracle Relayer: DEMO MODE ===");
  console.log(`Interval: ${DEMO_INTERVAL_MS}ms`);

  await initEthers();
  
  const abiPath = new URL("./abi.json", import.meta.url);
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
  const baseWallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, provider);
  const wallet = new ethers.NonceManager(baseWallet);
  
  const address = CONTRACT_ADDRESS || ethers.ZeroAddress;
  const contract = new ethers.Contract(address, abi, wallet);

  let sequence = [];
  let globalDistrictId = "1";
  try {
    const data = fs.readFileSync(SEQUENCE_PATH, "utf8");
    const parsed = JSON.parse(data);
    globalDistrictId = parsed.districtId ? parsed.districtId.toString() : "1";
    sequence = Array.isArray(parsed) ? parsed : (parsed.sequence || []);
    if (sequence.length === 0) throw new Error("Sequence array is empty");
    console.log(`Loaded ${sequence.length} items from demo_sequence.json`);
  } catch (err) {
    console.warn(`Could not load ${SEQUENCE_PATH}. Using a generated stub sequence for demo.`);
    // Stub sequence: smoothly incrementing risk score for a single district to trigger payout
    sequence = [
      { districtId: "1", riskScore: 20 },
      { districtId: "1", riskScore: 35 },
      { districtId: "1", riskScore: 50 },
      { districtId: "1", riskScore: 65 },
      { districtId: "1", riskScore: 85 }, // Triggers payout conceptually
      { districtId: "1", riskScore: 95 }
    ];
  }

  let index = 0;

  async function processNextInSequence() {
    if (index >= sequence.length) {
      console.log("Demo sequence completed.");
      process.exit(0);
    }

    const item = sequence[index];
    const districtId = item.districtId ? item.districtId.toString() : globalDistrictId;
    const riskScore = item._verified_score !== undefined ? item._verified_score : item.riskScore;
    const timestamp = item.timestamp || Math.floor(new Date(item.date || Date.now()).getTime() / 1000);

    console.log(`[Demo Step ${index + 1}/${sequence.length}] Emulating ML fetch: District ${districtId} -> ${riskScore}`);

    const state = districtStates[districtId] || { lastSubmittedScore: null, pendingOutlier: null, consecutiveCount: 0 };
    districtStates[districtId] = state; // Ensure it exists

    // Demo mode uses the exact same outlier guard logic conceptually, but we execute it inline
    // to reuse the same pipeline rules without actually fetching via HTTP.
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
          index++;
          setTimeout(processNextInSequence, DEMO_INTERVAL_MS);
          return;
        } else {
          logWarning(`Outlier persisted for District ${districtId}. Proceeding with submission.`);
        }
      }
    }

    state.pendingOutlier = null;
    state.consecutiveCount = 0;

    try {
      const signature = await signPayload(districtId, riskScore, timestamp);
      
      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === ethers.ZeroAddress) {
        logWarning(`RiskOracle address not configured. Would have submitted: district=${districtId}, score=${riskScore}, sig=${signature}`);
        state.lastSubmittedScore = riskScore;
      } else {
        const tx = await contract.submitRiskScore(districtId, riskScore, timestamp, signature);
        const receipt = await tx.wait();
        state.lastSubmittedScore = riskScore;
        logSubmission(districtId, riskScore, receipt.hash);
      }
    } catch (error) {
      console.error(`Error submitting risk score for district ${districtId}:`, error.message);
    }

    index++;
    setTimeout(processNextInSequence, DEMO_INTERVAL_MS);
  }

  processNextInSequence();
}

runDemo().catch(console.error);

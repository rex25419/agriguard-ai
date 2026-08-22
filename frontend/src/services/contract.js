import { ethers } from 'ethers';
import addresses from '../contracts/deployed-addresses.json';
import PolicyManagerArtifact from '../contracts/PolicyManager.json';
import RiskOracleArtifact from '../contracts/RiskOracle.json';

const DEFAULT_RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc-amoy.polygon.technology';
const ML_SERVICE_URL = import.meta.env.VITE_ML_SERVICE_URL || '';

// Initialize provider and contract instances
let provider;
let signer;
let policyManager;
let riskOracle;

function getFallbackProvider() {
  try {
    return new ethers.JsonRpcProvider(DEFAULT_RPC_URL);
  } catch (err) {
    console.warn("Failed to connect to primary RPC URL, attempting local fallback:", err);
    return new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  }
}

export const initContracts = async (address) => {
  try {
    if (window.ethereum) {
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner(address).catch(() => null);
    }
    
    if (!signer) {
      provider = getFallbackProvider();
      signer = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider); // hardhat account #1
    }

    if (addresses.policyManagerAddress && addresses.policyManagerAddress !== ethers.ZeroAddress) {
      policyManager = new ethers.Contract(
        addresses.policyManagerAddress,
        PolicyManagerArtifact.abi,
        signer
      );
    }

    if (addresses.riskOracleAddress && addresses.riskOracleAddress !== ethers.ZeroAddress) {
      riskOracle = new ethers.Contract(
        addresses.riskOracleAddress,
        RiskOracleArtifact.abi,
        signer
      );
    }
  } catch (err) {
    console.warn("Error initializing contracts:", err.message);
  }
};

export const fetchPolicyDetails = async (address) => {
  if (!policyManager || !signer) await initContracts(address);

  // 1. Try on-chain policy check
  if (policyManager) {
    try {
      const filter = policyManager.filters.PolicyPurchased(null, address);
      const events = await policyManager.queryFilter(filter).catch(() => []);
      
      if (events.length > 0) {
        const latestEvent = events[events.length - 1];
        const policyId = latestEvent.args[0];
        const policy = await policyManager.policies(policyId);
        
        if (policy.active) {
          return {
            policyId: policyId.toString(),
            farmerAddress: policy.farmer,
            districtId: policy.districtId.toString(),
            cropType: policy.cropType,
            coverageArea: "50 Hectares",
            location: "District " + policy.districtId.toString(),
            basePremium: ethers.formatEther(policy.premiumPaid),
            maxPayout: ethers.formatEther(policy.sumInsured),
            status: "Active",
            lastPayoutEpoch: Number(policy.lastPayoutEpoch)
          };
        }
      }
    } catch (error) {
      console.warn("Error fetching on-chain policy details, falling back to simulated state:", error.message);
    }
  }

  // 2. Simulation state fallback
  const storedPolicy = JSON.parse(localStorage.getItem('agriguard_sim_active_policy') || 'null');
  if (storedPolicy && storedPolicy.status === "Active") {
    return storedPolicy;
  }

  return null;
};

export const fetchCurrentRiskScore = async (districtId = 1) => {
  // Check if simulated override exists
  const simOverride = JSON.parse(localStorage.getItem(`agriguard_sim_risk_${districtId}`) || 'null');
  if (simOverride && simOverride.score !== undefined) {
    return simOverride;
  }

  // 1. Try on-chain risk score query
  if (riskOracle) {
    try {
      const result = await riskOracle.getLatestScore(districtId);
      const score = Number(result[0]);
      if (score > 0) {
        return {
          score,
          timestamp: Number(result[1])
        };
      }
    } catch (error) {
      console.warn("On-chain risk score query failed, querying live ML service:", error.message);
    }
  }

  // 2. Fallback: Fetch directly from Cloud Run ML API service
  try {
    const response = await fetch(`${ML_SERVICE_URL}/districts/${districtId}/history`);
    if (response.ok) {
      const history = await response.json();
      if (Array.isArray(history) && history.length > 0) {
        const latest = history[history.length - 1];
        return {
          score: Number(latest.riskScore),
          timestamp: Math.floor(Date.now() / 1000)
        };
      }
    }
  } catch (err) {
    console.warn("Could not query Cloud Run ML service directly:", err.message);
  }

  return { score: 72, timestamp: Math.floor(Date.now() / 1000) };
};

export const calculateGraduatedPayout = (riskScore, maxPayout) => {
  if (riskScore < 40) return 0;
  if (riskScore <= 70) {
    return (maxPayout * 20) / 100;
  }
  if (riskScore <= 90) {
    return (maxPayout * 60) / 100;
  }
  return maxPayout; // 100%
};

export const calculateNextPremium = (basePremium, averageRiskTrend) => {
  const riskFactor = averageRiskTrend / 50; 
  return basePremium * riskFactor;
};

export const buyPolicy = async (districtId, cropType, sumInsuredEther, currentRollingAvg) => {
  const sumInsuredStr = sumInsuredEther.toString();

  // Try on-chain transaction first if contract is present
  if (policyManager && signer) {
    try {
      const sumInsuredWei = ethers.parseEther(sumInsuredStr);
      let rollingAvg = currentRollingAvg;
      if (!rollingAvg) {
        rollingAvg = await policyManager.getDistrictRollingAvg(districtId).catch(() => 50);
      }
      let requiredPremium = (sumInsuredWei * BigInt(rollingAvg)) / BigInt(1000);
      if (requiredPremium === BigInt(0)) requiredPremium = BigInt(1);

      const tx = await policyManager.buyPolicy(districtId, cropType, sumInsuredWei, {
        value: requiredPremium
      });
      await tx.wait();
      return tx.hash;
    } catch (err) {
      console.warn("On-chain buyPolicy failed or wallet unconfirmed, running in simulation mode:", err.message);
    }
  }

  // Simulation mode fallback
  const policyId = "POL-" + Math.floor(1000 + Math.random() * 9000) + "-AI";
  const basePremium = (parseFloat(sumInsuredStr) * 0.05).toFixed(2);
  const txHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");

  const farmerAddr = signer ? await signer.getAddress().catch(() => "0x70997970C51812dc3A010C7d01b50e0d17dc79C8") : "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const newPolicy = {
    policyId,
    farmerAddress: farmerAddr,
    districtId: districtId.toString(),
    cropType: cropType || "Wheat",
    coverageArea: "50 Hectares",
    location: "District " + districtId,
    basePremium,
    maxPayout: sumInsuredStr,
    status: "Active",
    lastPayoutEpoch: 0
  };

  localStorage.setItem('agriguard_sim_active_policy', JSON.stringify(newPolicy));

  const policyEvent = {
    name: "PolicyPurchased",
    policyId,
    farmer: farmerAddr,
    districtId: districtId.toString(),
    sumInsured: sumInsuredStr,
    txHash
  };

  const existingPolicyEvents = JSON.parse(localStorage.getItem('agriguard_sim_policy_events') || '[]');
  existingPolicyEvents.unshift(policyEvent);
  localStorage.setItem('agriguard_sim_policy_events', JSON.stringify(existingPolicyEvents));

  return txHash;
};

export const triggerPayoutCheck = async (policyId) => {
  if (policyManager && signer) {
    try {
      const tx = await policyManager.checkAndPayout(policyId);
      await tx.wait();
      return tx.hash;
    } catch (err) {
      console.warn("On-chain payout check failed, running in simulation mode:", err.message);
    }
  }

  // Simulation mode fallback
  const storedPolicy = JSON.parse(localStorage.getItem('agriguard_sim_active_policy') || 'null');
  if (!storedPolicy) throw new Error("No active policy found to check payout");

  const { score: currentRisk } = await fetchCurrentRiskScore(storedPolicy.districtId);
  const payoutAmount = calculateGraduatedPayout(currentRisk, parseFloat(storedPolicy.maxPayout));

  if (payoutAmount <= 0) {
    throw new Error(`Current risk score (${currentRisk}) is below minimum payout threshold (40)`);
  }

  const txHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");
  storedPolicy.lastPayoutEpoch = Math.floor(Date.now() / 1000);
  localStorage.setItem('agriguard_sim_active_policy', JSON.stringify(storedPolicy));

  const payoutEvent = {
    name: "PayoutExecuted",
    policyId: storedPolicy.policyId,
    riskScore: currentRisk.toString(),
    payoutAmount: payoutAmount.toFixed(2),
    txHash
  };

  const existingPayoutEvents = JSON.parse(localStorage.getItem('agriguard_sim_payout_events') || '[]');
  existingPayoutEvents.unshift(payoutEvent);
  localStorage.setItem('agriguard_sim_payout_events', JSON.stringify(existingPayoutEvents));

  return txHash;
};

export const simulateOracleScoreUpdate = async (districtId = "1", score = null) => {
  let targetScore = score;
  if (targetScore === null) {
    // Query live ML Cloud Run backend
    const { score: mlScore } = await fetchCurrentRiskScore(districtId);
    targetScore = mlScore > 0 ? mlScore : Math.floor(65 + Math.random() * 25);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const txHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");

  const newScoreEvent = {
    name: "RiskScoreUpdated",
    districtId: districtId.toString(),
    riskScore: targetScore.toString(),
    timestamp,
    txHash
  };

  const existingScoreEvents = JSON.parse(localStorage.getItem('agriguard_sim_score_events') || '[]');
  existingScoreEvents.unshift(newScoreEvent);
  localStorage.setItem('agriguard_sim_score_events', JSON.stringify(existingScoreEvents));

  localStorage.setItem(`agriguard_sim_risk_${districtId}`, JSON.stringify({ score: targetScore, timestamp }));

  return newScoreEvent;
};

export const clearSimulationData = () => {
  localStorage.removeItem('agriguard_sim_active_policy');
  localStorage.removeItem('agriguard_sim_score_events');
  localStorage.removeItem('agriguard_sim_payout_events');
  localStorage.removeItem('agriguard_sim_policy_events');
  for (let i = 1; i <= 10; i++) {
    localStorage.removeItem(`agriguard_sim_risk_${i}`);
  }
};

export const fetchAllEvents = async () => {
  let scoreEvents = [];
  let payoutEvents = [];
  let policyEvents = [];

  // 1. Try querying on-chain events
  if (policyManager || riskOracle) {
    try {
      if (riskOracle) {
        const chainScore = await riskOracle.queryFilter(riskOracle.filters.RiskScoreUpdated()).catch(() => []);
        scoreEvents = chainScore.map(e => ({
          name: "RiskScoreUpdated",
          districtId: e.args[0].toString(),
          riskScore: e.args[1].toString(),
          timestamp: Number(e.args[2]),
          txHash: e.transactionHash
        })).reverse();
      }
      if (policyManager) {
        const chainPayout = await policyManager.queryFilter(policyManager.filters.PayoutExecuted()).catch(() => []);
        payoutEvents = chainPayout.map(e => ({
          name: "PayoutExecuted",
          policyId: e.args[0].toString(),
          riskScore: e.args[1].toString(),
          payoutAmount: ethers.formatEther(e.args[2]),
          txHash: e.transactionHash
        })).reverse();

        const chainPolicy = await policyManager.queryFilter(policyManager.filters.PolicyPurchased()).catch(() => []);
        policyEvents = chainPolicy.map(e => ({
          name: "PolicyPurchased",
          policyId: e.args[0].toString(),
          farmer: e.args[1],
          districtId: e.args[2].toString(),
          sumInsured: ethers.formatEther(e.args[4]),
          txHash: e.transactionHash
        })).reverse();
      }
    } catch (err) {
      console.warn("Could not query on-chain events:", err.message);
    }
  }

  // 2. Fetch simulated events stored in localStorage
  const simScoreEvents = JSON.parse(localStorage.getItem('agriguard_sim_score_events') || '[]');
  const simPayoutEvents = JSON.parse(localStorage.getItem('agriguard_sim_payout_events') || '[]');
  const simPolicyEvents = JSON.parse(localStorage.getItem('agriguard_sim_policy_events') || '[]');

  // Seed default demo events if empty
  if (scoreEvents.length === 0 && simScoreEvents.length === 0) {
    const now = Math.floor(Date.now() / 1000);
    simScoreEvents.push(
      { name: "RiskScoreUpdated", districtId: "1", riskScore: "78", timestamp: now - 180, txHash: "0xa8f391b4e20984c1" },
      { name: "RiskScoreUpdated", districtId: "1", riskScore: "52", timestamp: now - 3600, txHash: "0xc4d28e4a901831f2" }
    );
  }

  return {
    scoreEvents: [...scoreEvents, ...simScoreEvents],
    payoutEvents: [...payoutEvents, ...simPayoutEvents],
    policyEvents: [...policyEvents, ...simPolicyEvents]
  };
};

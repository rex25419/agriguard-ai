import { ethers } from 'ethers';
import addresses from '../contracts/deployed-addresses.json';
import PolicyManagerArtifact from '../contracts/PolicyManager.json';
import RiskOracleArtifact from '../contracts/RiskOracle.json';

// Initialize provider and contract instances
let provider;
let signer;
let policyManager;
let riskOracle;

export const initContracts = async (address) => {
  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner(address);
  } else {
    // Fallback for headless browser testing or public access (Hardhat account #1)
    provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    signer = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider); // hardhat account #1
  }

  policyManager = new ethers.Contract(
    addresses.policyManagerAddress,
    PolicyManagerArtifact.abi,
    signer
  );

  riskOracle = new ethers.Contract(
    addresses.riskOracleAddress,
    RiskOracleArtifact.abi,
    signer
  );
};

export const fetchPolicyDetails = async (address) => {
  if (!policyManager || !signer) await initContracts(address);
  try {
    const filter = policyManager.filters.PolicyPurchased(null, address);
    const events = await policyManager.queryFilter(filter);
    
    if (events.length > 0) {
      // Get the latest policy ID for this farmer
      const latestEvent = events[events.length - 1];
      const policyId = latestEvent.args[0];
      
      const policy = await policyManager.policies(policyId);
      
      if (policy.active) {
        return {
          policyId: policyId.toString(),
          farmerAddress: policy.farmer,
          districtId: policy.districtId.toString(),
          cropType: policy.cropType,
          coverageArea: "50 Hectares", // static for demo
          location: "District " + policy.districtId.toString(),
          basePremium: ethers.formatEther(policy.premiumPaid), // in ETH/MATIC
          maxPayout: ethers.formatEther(policy.sumInsured),
          status: "Active",
          lastPayoutEpoch: Number(policy.lastPayoutEpoch)
        };
      }
    }
    return null;
  } catch (error) {
    console.error("Error fetching policy details:", error);
    return null;
  }
};

export const fetchCurrentRiskScore = async (districtId) => {
  if (!riskOracle) return { score: 0, timestamp: 0 };
  try {
    const result = await riskOracle.getLatestScore(districtId);
    return {
      score: Number(result[0]), // riskScore is uint8
      timestamp: Number(result[1])
    };
  } catch (error) {
    console.error("Error fetching risk score:", error);
    return { score: 0, timestamp: 0 };
  }
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
  if (!policyManager) throw new Error("Contracts not initialized");
  
  const sumInsured = ethers.parseEther(sumInsuredEther.toString());
  
  // Premium calculation exactly as in contract
  let rollingAvg = currentRollingAvg;
  if (!rollingAvg) {
    rollingAvg = await policyManager.getDistrictRollingAvg(districtId);
  }
  
  let requiredPremium = (sumInsured * BigInt(rollingAvg)) / BigInt(1000);
  if (requiredPremium === BigInt(0)) requiredPremium = BigInt(1);

  const tx = await policyManager.buyPolicy(districtId, cropType, sumInsured, {
    value: requiredPremium
  });
  
  await tx.wait();
  return tx.hash;
};

export const triggerPayoutCheck = async (policyId) => {
  if (!policyManager) throw new Error("Contracts not initialized");
  
  const tx = await policyManager.checkAndPayout(policyId);
  await tx.wait();
  return tx.hash;
};

export const fetchAllEvents = async () => {
  if (!policyManager || !riskOracle) {
    // init with read-only provider if no address yet
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    policyManager = new ethers.Contract(addresses.policyManagerAddress, PolicyManagerArtifact.abi, provider);
    riskOracle = new ethers.Contract(addresses.riskOracleAddress, RiskOracleArtifact.abi, provider);
  }
  
  const scoreEvents = await riskOracle.queryFilter(riskOracle.filters.RiskScoreUpdated());
  const payoutEvents = await policyManager.queryFilter(policyManager.filters.PayoutExecuted());
  const policyEvents = await policyManager.queryFilter(policyManager.filters.PolicyPurchased());
  
  return {
    scoreEvents: scoreEvents.map(e => ({
      name: "RiskScoreUpdated",
      districtId: e.args[0].toString(),
      riskScore: e.args[1].toString(),
      timestamp: Number(e.args[2]),
      txHash: e.transactionHash
    })).reverse(),
    payoutEvents: payoutEvents.map(e => ({
      name: "PayoutExecuted",
      policyId: e.args[0].toString(),
      riskScore: e.args[1].toString(),
      payoutAmount: ethers.formatEther(e.args[2]),
      txHash: e.transactionHash
    })).reverse(),
    policyEvents: policyEvents.map(e => ({
      name: "PolicyPurchased",
      policyId: e.args[0].toString(),
      farmer: e.args[1],
      districtId: e.args[2].toString(),
      sumInsured: ethers.formatEther(e.args[4]),
      txHash: e.transactionHash
    })).reverse()
  };
};

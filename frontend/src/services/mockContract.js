// src/services/mockContract.js

/**
 * Mocking the contract and oracle data for the AgriGuard AI dApp.
 */
export const fetchPolicyDetails = async (address) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        policyId: "POL-8492-AX",
        farmerAddress: address || "0x00...0000",
        cropType: "Wheat",
        coverageArea: "50 Hectares",
        location: "Punjab, India",
        basePremium: 15.5, // in MATIC
        maxPayout: 500.0, // in MATIC
        status: "Active",
      });
    }, 800);
  });
};

export const fetchCurrentRiskScore = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Return a mocked ML risk score between 0 and 100
      resolve(68.4);
    }, 600);
  });
};

export const calculateGraduatedPayout = (riskScore, maxPayout) => {
  // Graduated payout logic: 
  // < 40: 0% payout
  // 40 - 70: linear increase from 0% to 50%
  // 70 - 100: linear increase from 50% to 100%
  if (riskScore < 40) return 0;
  if (riskScore <= 70) {
    return ((riskScore - 40) / 30) * 0.5 * maxPayout;
  }
  return (0.5 + ((riskScore - 70) / 30) * 0.5) * maxPayout;
};

export const calculateNextPremium = (basePremium, averageRiskTrend) => {
  // If the rolling risk trend is high, premium goes up, if low, it goes down.
  // Mock average risk trend around 65.
  const riskFactor = averageRiskTrend / 50; 
  return basePremium * riskFactor;
};

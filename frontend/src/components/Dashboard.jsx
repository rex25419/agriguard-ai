// src/components/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import WalletConnect from './WalletConnect';
import RiskScoreCard from './RiskScoreCard';
import PayoutSimulator from './PayoutSimulator';
import BuyPolicy from './BuyPolicy';
import { fetchPolicyDetails, fetchCurrentRiskScore } from '../services/contract';
import { Shield, MapPin, Leaf, FileText, RefreshCw } from 'lucide-react';

const Dashboard = () => {
  const [address, setAddress] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [riskScore, setRiskScore] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (address) {
      setLoading(true);
      const fetchedPolicy = await fetchPolicyDetails(address);
      setPolicy(fetchedPolicy);
      
      if (fetchedPolicy) {
        const fetchedScore = await fetchCurrentRiskScore(fetchedPolicy.districtId);
        setRiskScore(fetchedScore);
      } else {
        setRiskScore(0);
      }
      setLoading(false);
    } else {
      setPolicy(null);
      setRiskScore(0);
    }
  };

  useEffect(() => {
    loadData();
  }, [address]);

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <Shield size={36} className="text-primary animate-pulse" />
          <h1 className="text-3xl font-bold tracking-tight">AgriGuard<span className="text-primary">AI</span></h1>
        </div>
        <WalletConnect onConnect={setAddress} />
      </header>

      {!address ? (
        <div className="flex flex-col items-center justify-center h-64 glass-panel text-center">
          <Shield size={64} className="text-secondary mb-4 opacity-50" />
          <h2 className="text-2xl font-bold mb-2">Welcome to AgriGuard AI</h2>
          <p className="text-secondary">Please connect your wallet to view your parametric policy.</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-pulse text-xl text-primary font-bold">Loading Blockchain Data...</div>
        </div>
      ) : !policy ? (
        <BuyPolicy address={address} onPolicyBought={loadData} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-8">
            {/* Policy Info Card */}
            <div className="glass-panel p-6 relative">
              <button 
                onClick={loadData}
                className="absolute top-6 right-6 text-secondary hover:text-primary transition-colors"
                title="Refresh Policy Data"
              >
                <RefreshCw size={20} />
              </button>

              <h3 className="text-xl font-bold mb-6 border-b border-white/10 pb-4">Active Policy</h3>
              
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-secondary">
                    <FileText size={18} />
                    <span>Policy ID</span>
                  </div>
                  <span className="font-bold">{policy.policyId}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-secondary">
                    <Leaf size={18} />
                    <span>Crop Type</span>
                  </div>
                  <span className="font-bold">{policy.cropType} ({policy.coverageArea})</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-secondary">
                    <MapPin size={18} />
                    <span>Location</span>
                  </div>
                  <span className="font-bold">{policy.location}</span>
                </div>
                
                <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                  <div>
                    <div className="text-sm text-secondary">Base Premium</div>
                    <div className="font-bold text-lg">{policy.basePremium} MATIC</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-secondary">Max Payout</div>
                    <div className="font-bold text-lg text-primary">{policy.maxPayout} MATIC</div>
                  </div>
                </div>
              </div>
            </div>

            <RiskScoreCard score={riskScore} />
          </div>

          <div>
            <PayoutSimulator currentRisk={riskScore} policy={policy} onPayout={loadData} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

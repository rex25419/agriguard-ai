// src/components/PayoutSimulator.jsx
import React, { useState, useEffect } from 'react';
import { calculateGraduatedPayout, calculateNextPremium, triggerPayoutCheck } from '../services/contract';
import { Calculator, Coins, TrendingUp } from 'lucide-react';

const PayoutSimulator = ({ currentRisk, scoreTimestamp, policy, onPayout }) => {
  const [simulatedRisk, setSimulatedRisk] = useState(currentRisk);
  const [payout, setPayout] = useState(0);
  const [nextPremium, setNextPremium] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (policy) {
      setSimulatedRisk(currentRisk);
    }
  }, [currentRisk, policy]);

  useEffect(() => {
    if (policy) {
      setPayout(calculateGraduatedPayout(simulatedRisk, policy.maxPayout));
      setNextPremium(calculateNextPremium(policy.basePremium, simulatedRisk));
    }
  }, [simulatedRisk, policy]);

  const handleTriggerPayout = async () => {
    setLoading(true);
    setError(null);
    try {
      await triggerPayoutCheck(policy.policyId);
      if (onPayout) onPayout();
    } catch (err) {
      console.error(err);
      if (err.message && err.message.includes("payout already claimed for this oracle epoch")) {
        setError("Payout for this epoch has already been claimed.");
      } else {
        setError(err.message || 'Failed to trigger payout check');
      }
    } finally {
      setLoading(false);
    }
  };

  const isClaimedForEpoch = policy && policy.lastPayoutEpoch > 0 && scoreTimestamp > 0 && policy.lastPayoutEpoch >= scoreTimestamp;

  if (!policy) return null;

  return (
    <div className="glass-panel flex flex-col p-6">
      <div className="flex items-center gap-2 mb-6">
        <Calculator size={24} className="text-primary" />
        <h3 className="text-xl font-bold">Graduated Payout Simulator</h3>
      </div>

      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <span className="text-secondary">Risk Score for Calc (simulated slider)</span>
          <span className="font-bold">{simulatedRisk.toFixed(1)}</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="100" 
          step="0.1" 
          value={simulatedRisk} 
          onChange={(e) => setSimulatedRisk(parseFloat(e.target.value))}
          className="w-full"
          style={{ accentColor: 'var(--primary-color)' }}
        />
        <div className="flex justify-between text-xs text-secondary mt-1">
          <span>0 (Safe)</span>
          <span>40 (Threshold)</span>
          <span>100 (Critical)</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)' }}>
          <div className="flex items-center gap-2 mb-2 text-secondary">
            <Coins size={16} />
            <span className="text-sm">Estimated Payout</span>
          </div>
          <div className="text-2xl font-bold text-primary">
            {payout.toFixed(2)} MATIC
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)' }}>
          <div className="flex items-center gap-2 mb-2 text-secondary">
            <TrendingUp size={16} />
            <span className="text-sm">Next Cycle Premium</span>
          </div>
          <div className="text-2xl font-bold text-warning">
            {nextPremium.toFixed(2)} MATIC
          </div>
        </div>
      </div>
      
      {error && <div className="text-red-400 text-sm mt-4">{error}</div>}

      <button 
        className="btn btn-primary mt-6 w-full"
        onClick={handleTriggerPayout}
        disabled={loading || currentRisk < 40 || isClaimedForEpoch}
      >
        {loading ? 'Processing...' : isClaimedForEpoch ? 'Claimed for Current Epoch' : 'Check & Trigger Real Payout'}
      </button>
    </div>
  );
};

export default PayoutSimulator;

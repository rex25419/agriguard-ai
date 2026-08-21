import React, { useState } from 'react';
import { buyPolicy } from '../services/contract';
import { Shield } from 'lucide-react';

const BuyPolicy = ({ address, onPolicyBought }) => {
  const [districtId, setDistrictId] = useState('1');
  const [cropType, setCropType] = useState('Wheat');
  const [sumInsured, setSumInsured] = useState('100'); // MATIC
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleBuy = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Pass the parameters (districtId, cropType, sumInsured)
      // The currentRollingAvg is fetched in contract.js if undefined.
      await buyPolicy(districtId, cropType, sumInsured);
      onPolicyBought();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to buy policy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6 flex flex-col items-center justify-center">
      <Shield size={48} className="text-primary mb-4" />
      <h2 className="text-2xl font-bold mb-2">Secure Your Crops</h2>
      <p className="text-secondary mb-6 text-center">
        Purchase a parametric insurance policy to protect against climate risks.
      </p>

      {error && (
        <div className="bg-red-500/20 text-red-200 border border-red-500 p-3 rounded mb-4 w-full">
          {error}
        </div>
      )}

      <form onSubmit={handleBuy} className="w-full max-w-sm flex flex-col gap-4">
        <div>
          <label className="block text-sm font-bold mb-2">Select District</label>
          <select 
            className="w-full p-2 rounded bg-black/30 border border-white/10 text-white"
            value={districtId}
            onChange={(e) => setDistrictId(e.target.value)}
          >
            {[...Array(10)].map((_, i) => (
              <option key={i+1} value={i+1}>District {i+1}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold mb-2">Crop Type</label>
          <input 
            type="text" 
            className="w-full p-2 rounded bg-black/30 border border-white/10 text-white"
            value={cropType}
            onChange={(e) => setCropType(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-2">Sum Insured (MATIC)</label>
          <input 
            type="number" 
            className="w-full p-2 rounded bg-black/30 border border-white/10 text-white"
            value={sumInsured}
            onChange={(e) => setSumInsured(e.target.value)}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="btn btn-primary mt-2 flex items-center justify-center gap-2"
        >
          {loading ? 'Processing...' : 'Buy Policy'}
        </button>
      </form>
    </div>
  );
};

export default BuyPolicy;

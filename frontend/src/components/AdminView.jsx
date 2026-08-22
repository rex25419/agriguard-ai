import React, { useState, useEffect } from 'react';
import { fetchAllEvents, simulateOracleScoreUpdate, clearSimulationData } from '../services/contract';
import { Activity, ShieldCheck, RefreshCw, Zap, Trash2 } from 'lucide-react';

const AdminView = () => {
  const [events, setEvents] = useState({ scoreEvents: [], payoutEvents: [], policyEvents: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllEvents();
      setEvents(data);
    } catch (err) {
      console.error(err);
      setError('Could not refresh blockchain log');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateScoreUpdate = async () => {
    setSimulating(true);
    try {
      await simulateOracleScoreUpdate("1");
      await loadEvents();
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  const handleClearDemo = async () => {
    clearSimulationData();
    await loadEvents();
  };

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 mt-8">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Activity size={24} className="text-primary" />
          Transparency / Admin Log
        </h2>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleSimulateScoreUpdate} 
            disabled={simulating} 
            className="btn btn-primary flex items-center gap-2 p-2 text-sm"
            title="Fetch ML model risk score and trigger an Oracle update log"
          >
            <Zap size={16} className={simulating ? 'animate-pulse' : ''} />
            {simulating ? 'Simulating...' : 'Simulate Oracle Update'}
          </button>

          <button 
            onClick={handleClearDemo} 
            className="btn btn-secondary flex items-center gap-2 p-2 text-sm text-red-400 hover:text-red-300"
            title="Reset simulation log data"
          >
            <Trash2 size={16} />
            Reset Demo
          </button>

          <button onClick={loadEvents} disabled={loading} className="btn btn-secondary flex items-center gap-2 p-2">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="text-red-400 mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Risk Scores Log */}
        <div className="glass-panel p-4 h-96 overflow-y-auto">
          <h3 className="text-lg font-bold mb-4 border-b border-white/10 pb-2 flex justify-between items-center">
            <span>Oracle Risk Updates</span>
            <span className="text-xs text-secondary font-normal">Live ML Feed</span>
          </h3>
          <div className="flex flex-col gap-2">
            {events.scoreEvents.map((evt, idx) => (
              <div key={idx} className="bg-black/20 p-3 rounded text-sm border border-white/5 hover:border-primary/40 transition-colors">
                <div className="flex justify-between text-secondary mb-1">
                  <span>District {evt.districtId}</span>
                  <span>{new Date(evt.timestamp * 1000).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between font-bold items-center">
                  <span className={Number(evt.riskScore) > 70 ? 'text-red-400' : Number(evt.riskScore) > 40 ? 'text-yellow-400' : 'text-green-400'}>
                    Risk Score: {evt.riskScore}
                  </span>
                  <a href={`#`} className="text-primary truncate ml-4 font-mono text-xs" title={evt.txHash}>
                    {evt.txHash.slice(0, 14)}...
                  </a>
                </div>
              </div>
            ))}
            {events.scoreEvents.length === 0 && <p className="text-secondary text-center py-4">No risk updates yet.</p>}
          </div>
        </div>

        {/* Payouts and Policies Log */}
        <div className="glass-panel p-4 h-96 overflow-y-auto">
          <h3 className="text-lg font-bold mb-4 border-b border-white/10 pb-2">Policy & Payout Events</h3>
          <div className="flex flex-col gap-2">
            {events.payoutEvents.map((evt, idx) => (
              <div key={`payout-${idx}`} className="bg-primary/20 p-3 rounded text-sm border border-primary/50">
                <div className="flex items-center gap-2 text-primary font-bold mb-1">
                  <ShieldCheck size={16} /> Payout Executed
                </div>
                <div className="flex justify-between">
                  <span>Policy ID: {evt.policyId} (Score: {evt.riskScore})</span>
                  <span className="font-bold text-primary">{evt.payoutAmount} MATIC</span>
                </div>
              </div>
            ))}

            {events.policyEvents.map((evt, idx) => (
              <div key={`policy-${idx}`} className="bg-black/20 p-3 rounded text-sm border border-white/5">
                <div className="text-secondary mb-1 font-bold">Policy Purchased</div>
                <div className="flex justify-between">
                  <span>Policy {evt.policyId} | District {evt.districtId}</span>
                  <span className="font-bold text-secondary">{evt.sumInsured} MATIC</span>
                </div>
                <div className="text-xs text-secondary truncate mt-1 font-mono">Farmer: {evt.farmer}</div>
              </div>
            ))}

            {events.payoutEvents.length === 0 && events.policyEvents.length === 0 && (
              <p className="text-secondary text-center py-4">No policy events yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminView;

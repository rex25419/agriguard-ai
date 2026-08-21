import React, { useState, useEffect } from 'react';
import { fetchAllEvents } from '../services/contract';
import { Activity, ShieldCheck, RefreshCw } from 'lucide-react';

const AdminView = () => {
  const [events, setEvents] = useState({ scoreEvents: [], payoutEvents: [], policyEvents: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllEvents();
      setEvents(data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch blockchain events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Activity size={24} className="text-primary" />
          Transparency / Admin Log
        </h2>
        <button onClick={loadEvents} disabled={loading} className="btn btn-secondary flex items-center gap-2 p-2">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && <div className="text-red-400 mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Risk Scores Log */}
        <div className="glass-panel p-4 h-96 overflow-y-auto">
          <h3 className="text-lg font-bold mb-4 border-b border-white/10 pb-2">Oracle Risk Updates</h3>
          <div className="flex flex-col gap-2">
            {events.scoreEvents.map((evt, idx) => (
              <div key={idx} className="bg-black/20 p-3 rounded text-sm">
                <div className="flex justify-between text-secondary mb-1">
                  <span>District {evt.districtId}</span>
                  <span>{new Date(evt.timestamp * 1000).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Risk Score: {evt.riskScore}</span>
                  <a href={`#`} className="text-primary truncate ml-4" title={evt.txHash}>
                    {evt.txHash.slice(0, 10)}...
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
                  <span className="font-bold">{evt.payoutAmount} MATIC</span>
                </div>
              </div>
            ))}

            {events.policyEvents.map((evt, idx) => (
              <div key={`policy-${idx}`} className="bg-black/20 p-3 rounded text-sm">
                <div className="text-secondary mb-1 font-bold">Policy Purchased</div>
                <div className="flex justify-between">
                  <span>Policy {evt.policyId} | District {evt.districtId}</span>
                  <span>{evt.sumInsured} MATIC</span>
                </div>
                <div className="text-xs text-secondary truncate mt-1">Farmer: {evt.farmer}</div>
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

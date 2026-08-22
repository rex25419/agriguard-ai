import React, { useState, useEffect } from 'react';
import { simulateOracleScoreUpdate, fetchCurrentRiskScore } from '../services/contract';
import { Zap, AlertTriangle, Cpu, Sliders, CheckCircle2, Shield, Activity, RefreshCw } from 'lucide-react';

const ML_SERVICE_URL = import.meta.env.VITE_ML_SERVICE_URL || '';

const DISTRICT_NAMES = {
  "1": "District 1 (Ludhiana)",
  "2": "District 2 (Patiala)",
  "3": "District 3 (Amritsar)",
  "4": "District 4 (Jalandhar)",
  "5": "District 5 (Bathinda)",
  "6": "District 6 (Sangrur)",
  "7": "District 7 (Firozpur)",
  "8": "District 8 (Gurdaspur)",
  "9": "District 9 (Hoshiarpur)",
  "10": "District 10 (Moga)"
};

const PRESETS = {
  NORMAL: { name: "🌾 Normal Weather", rainfall: 12.5, dryDays: 2, temp: 28.5, smi: 0.75 },
  MODERATE: { name: "⚠️ Mild Drought", rainfall: 3.2, dryDays: 14, temp: 36.0, smi: 0.35 },
  CRITICAL: { name: "🚨 Severe Drought (Payout)", rainfall: 0.1, dryDays: 28, temp: 42.5, smi: 0.12 },
  OUTLIER: { name: "⚡ Abrupt Outlier Jump", rainfall: 0.0, dryDays: 40, temp: 46.0, smi: 0.05 }
};

const OracleSimulator = ({ onUpdate }) => {
  const [districtId, setDistrictId] = useState("1");
  const [rainfall, setRainfall] = useState(0.1);
  const [dryDays, setDryDays] = useState(28);
  const [temp, setTemp] = useState(42.5);
  const [smi, setSmi] = useState(0.12);

  const [predictedScore, setPredictedScore] = useState(88);
  const [confidence, setConfidence] = useState(0.92);
  const [lastSubmittedScore, setLastSubmittedScore] = useState(null);
  const [outlierWarning, setOutlierWarning] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Calculate or fetch ML score when inputs change
  const calculateScore = async () => {
    setLoading(true);
    setOutlierWarning(null);
    try {
      // 1. Try calling the live FastAPI ML backend /score endpoint
      const response = await fetch(`${ML_SERVICE_URL}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          districtId: parseInt(districtId, 10),
          date: new Date().toISOString().split('T')[0],
          rainfall_mm: parseFloat(rainfall),
          consecutive_dry_days: parseInt(dryDays, 10),
          temperature_c: parseFloat(temp),
          soil_moisture_index: parseFloat(smi)
        })
      });

      if (response.ok) {
        const data = await response.json();
        setPredictedScore(data.riskScore);
        setConfidence(data.confidence);
      } else {
        throw new Error("FastAPI fallback");
      }
    } catch (err) {
      // 2. Synthetic model calculation fallback
      const dryFactor = Math.min(100, (dryDays / 30.0) * 50);
      const tempFactor = Math.max(0, (temp - 30) * 3);
      const smiPenalty = (1.0 - smi) * 40;
      const rainRelief = Math.min(30, rainfall * 2.5);

      const calculated = Math.round(Math.max(0, Math.min(100, dryFactor + tempFactor + smiPenalty - rainRelief)));
      setPredictedScore(calculated);
      setConfidence(0.89);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateScore();
  }, [districtId, rainfall, dryDays, temp, smi]);

  const applyPreset = (presetKey) => {
    const p = PRESETS[presetKey];
    if (p) {
      setRainfall(p.rainfall);
      setDryDays(p.dryDays);
      setTemp(p.temp);
      setSmi(p.smi);
    }
  };

  const handlePushOracleUpdate = async () => {
    setSubmitting(true);
    setStatusMsg(null);
    setOutlierWarning(null);

    try {
      // Check Outlier Guard condition (>40 point jump)
      if (lastSubmittedScore !== null) {
        const jump = Math.abs(predictedScore - lastSubmittedScore);
        if (jump > 40) {
          setOutlierWarning(`Outlier Guard Triggered! Jump of ${jump} points detected (${lastSubmittedScore} -> ${predictedScore}). State logged for poll verification.`);
        }
      }

      // Execute simulation score update
      const event = await simulateOracleScoreUpdate(districtId, predictedScore);
      setLastSubmittedScore(predictedScore);
      setStatusMsg(`Oracle Risk Score ${predictedScore} submitted for District ${districtId}! TX: ${event.txHash.substring(0, 14)}...`);

      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to push Oracle update");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-panel p-6 mb-8 border border-primary/20 bg-black/40">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Cpu size={28} className="text-primary animate-pulse" />
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              AgriGuard AI Oracle Simulator
            </h3>
            <p className="text-xs text-secondary">
              Simulate weather sensor feeds & trigger ECDSA-signed Oracle risk score updates on-chain
            </p>
          </div>
        </div>

        {/* Preset Selector Buttons */}
        <div className="flex flex-wrap gap-2">
          {Object.keys(PRESETS).map((key) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="btn btn-secondary text-xs px-3 py-1.5 hover:border-primary/50 transition-colors"
            >
              {PRESETS[key].name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* District & Parameter Controls */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-secondary mb-1">Target District</label>
              <select
                className="w-full p-2.5 rounded bg-black/50 border border-white/10 text-white font-medium text-sm focus:border-primary outline-none"
                value={districtId}
                onChange={(e) => setDistrictId(e.target.value)}
              >
                {Object.keys(DISTRICT_NAMES).map((id) => (
                  <option key={id} value={id}>
                    {DISTRICT_NAMES[id]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-secondary mb-1">
                Temperature: <span className="text-white font-bold">{temp}°C</span>
              </label>
              <input
                type="range"
                min="15"
                max="50"
                step="0.5"
                value={temp}
                onChange={(e) => setTemp(parseFloat(e.target.value))}
                className="w-full mt-2"
                style={{ accentColor: 'var(--primary-color)' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-black/20 p-4 rounded border border-white/5">
            <div>
              <label className="block text-xs text-secondary mb-1">
                Rainfall: <span className="text-white font-bold">{rainfall} mm</span>
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="0.1"
                value={rainfall}
                onChange={(e) => setRainfall(parseFloat(e.target.value))}
                className="w-full mt-1"
              />
            </div>

            <div>
              <label className="block text-xs text-secondary mb-1">
                Dry Days: <span className="text-white font-bold">{dryDays} days</span>
              </label>
              <input
                type="range"
                min="0"
                max="45"
                step="1"
                value={dryDays}
                onChange={(e) => setDryDays(parseInt(e.target.value, 10))}
                className="w-full mt-1"
              />
            </div>

            <div>
              <label className="block text-xs text-secondary mb-1">
                Soil Moisture (SMI): <span className="text-white font-bold">{smi}</span>
              </label>
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.01"
                value={smi}
                onChange={(e) => setSmi(parseFloat(e.target.value))}
                className="w-full mt-1"
              />
            </div>
          </div>
        </div>

        {/* Live Model Output & Action */}
        <div className="glass-panel p-4 flex flex-col justify-between bg-black/30 border border-white/10">
          <div>
            <div className="text-xs text-secondary mb-1 flex justify-between items-center">
              <span>ML Risk Score Output</span>
              {loading && <RefreshCw size={12} className="animate-spin text-primary" />}
            </div>
            
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-4xl font-extrabold ${predictedScore > 70 ? 'text-red-400' : predictedScore > 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                {predictedScore}
              </span>
              <span className="text-xs text-secondary">/ 100</span>
            </div>

            <div className="text-xs text-secondary mb-3">
              Model Confidence: <span className="text-white font-bold">{(confidence * 100).toFixed(1)}%</span>
            </div>

            {outlierWarning && (
              <div className="bg-warning/20 border border-warning text-warning text-xs p-2 rounded mb-3 flex items-start gap-1.5">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{outlierWarning}</span>
              </div>
            )}

            {statusMsg && (
              <div className="bg-primary/20 border border-primary text-primary text-xs p-2 rounded mb-3 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="shrink-0" />
                <span className="truncate">{statusMsg}</span>
              </div>
            )}
          </div>

          <button
            onClick={handlePushOracleUpdate}
            disabled={submitting}
            className="btn btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 mt-4"
          >
            <Zap size={18} className={submitting ? 'animate-spin' : ''} />
            {submitting ? 'Signing & Submitting...' : `Submit Oracle Score (${predictedScore})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OracleSimulator;

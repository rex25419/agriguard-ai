// src/components/RiskScoreCard.jsx
import React from 'react';
import { ShieldAlert, ShieldCheck, Activity } from 'lucide-react';

const RiskScoreCard = ({ score }) => {
  // Determine color and icon based on risk score
  let statusColor = 'var(--primary-color)';
  let StatusIcon = ShieldCheck;
  let statusText = 'Low Risk';

  if (score > 70) {
    statusColor = 'var(--danger)';
    StatusIcon = ShieldAlert;
    statusText = 'Critical Risk';
  } else if (score > 40) {
    statusColor = 'var(--warning)';
    StatusIcon = Activity;
    statusText = 'Moderate Risk';
  }

  // Calculate rotation for gauge (0 to 180 degrees)
  const rotation = (score / 100) * 180;

  return (
    <div className="glass-panel flex flex-col items-center p-6">
      <h3 className="text-xl mb-4 font-bold">Current ML Risk Score</h3>
      
      {/* Semi-circle gauge visualization */}
      <div className="relative w-48 h-24 mb-4 overflow-hidden">
        <div 
          className="absolute w-48 h-48 rounded-full border-8"
          style={{ 
            borderColor: 'rgba(255,255,255,0.1)',
            borderBottomColor: 'transparent',
            borderRightColor: 'transparent',
            transform: 'rotate(45deg)'
          }}
        ></div>
        <div 
          className="absolute w-48 h-48 rounded-full border-8 transition-transform duration-1000 ease-out"
          style={{ 
            borderColor: statusColor,
            borderBottomColor: 'transparent',
            borderRightColor: 'transparent',
            transform: `rotate(${45 + rotation}deg)`
          }}
        ></div>
        <div className="absolute bottom-0 left-0 w-full text-center">
          <span className="text-3xl font-bold" style={{ color: statusColor }}>
            {score.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <StatusIcon color={statusColor} size={24} />
        <span className="text-lg font-bold" style={{ color: statusColor }}>{statusText}</span>
      </div>
      <p className="text-secondary text-sm mt-2 text-center">
        Updated daily by oracle relayer based on regional climate data.
      </p>
    </div>
  );
};

export default RiskScoreCard;

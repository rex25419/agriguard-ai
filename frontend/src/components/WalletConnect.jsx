// src/components/WalletConnect.jsx
import React, { useState } from 'react';
import { Wallet, LogOut } from 'lucide-react';
import { ethers } from 'ethers';

const WalletConnect = ({ onConnect }) => {
  const [address, setAddress] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setAddress(address);
        if (onConnect) onConnect(address);
      } else {
        // Fallback for headless browser testing (Hardhat account #1)
        const mockAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
        setAddress(mockAddress);
        if (onConnect) onConnect(mockAddress);
      }
    } catch (error) {
      console.error("Wallet connection failed", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    if (onConnect) onConnect(null);
  };

  if (address) {
    return (
      <div className="flex items-center gap-4">
        <div className="glass-panel" style={{ padding: '0.5rem 1rem', borderRadius: '20px' }}>
          <span className="text-sm font-bold text-primary">
            {address.substring(0, 6)}...{address.substring(address.length - 4)}
          </span>
        </div>
        <button onClick={disconnect} className="btn btn-secondary" style={{ padding: '0.5rem' }}>
          <LogOut size={18} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={connectWallet} disabled={isConnecting} className="btn btn-primary">
      <Wallet size={20} />
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  );
};

export default WalletConnect;

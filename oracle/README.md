# AgriGuard AI - Oracle Relayer

The Oracle Relayer is the bridge between our off-chain Machine Learning Risk Model and the on-chain `RiskOracle` smart contract deployed on the Polygon Amoy testnet.

## Overview

The relayer polls the ML FastAPI service for the latest daily risk scores across 10 districts, cryptographically signs the readings using the designated Oracle private key, and submits the data on-chain. This provides the transparency and automation required for our parametric crop insurance payout logic.

### Outlier Guard (Hackathon Simplification)
In a production environment, risk scores would be verified using a multi-node consensus mechanism (e.g., Chainlink Functions or a Custom Runtime Environment). For the scope of this hackathon, we implemented a stateful **Outlier Guard**:
If a district's risk score abruptly jumps by more than 40 points, the relayer halts the submission and logs a warning. It requires the outlier score to persist for 2 consecutive polling intervals before accepting it as valid and pushing it on-chain.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Update the `.env` variables:
   - `ORACLE_PRIVATE_KEY`: The private key of the authorized Oracle address (must match what the `RiskOracle` contract expects).
   - `RPC_URL`: The JSON-RPC endpoint for Polygon Amoy (or `http://127.0.0.1:8545` for local Hardhat).
   - `ML_SERVICE_URL`: URL of the FastAPI ML model (default: `http://localhost:8000`).
   - `RISK_ORACLE_ADDRESS`: The deployed address of the `RiskOracle` smart contract.

## Usage

### 1. Normal Mode
Runs the relayer in continuous polling mode, querying the ML service every 10 seconds (configurable via `POLL_INTERVAL_MS`).

```bash
node relayer.js
```
Logs are automatically appended to `submissions.log`.

### 2. Demo Mode
For the live hackathon presentation, we want to deterministically step through a sequence of risk scores to trigger the insurance payout on stage. 

`demo-mode.js` bypasses the HTTP polling and instead reads a local sequence array from `../ml/demo_sequence.json`, submitting them on a fast 5-second interval.

```bash
node demo-mode.js
```

### 3. Testing the Signing Scheme
Verify the payload hashing (`keccak256(abi.encodePacked(...))`) and signing logic works seamlessly:
```bash
node test-signing.js
```

## Cryptographic Spec
For details on how the payload is hashed and how the smart contract should execute `ecrecover`, please see [SIGNING_SCHEME.md](./SIGNING_SCHEME.md).

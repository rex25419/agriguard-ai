# AgriGuard AI: System Architecture

## System Overview

AgriGuard AI is a parametric crop insurance dApp. Instead of relying on manual claims adjusters or simple binary rainfall thresholds, the system uses an off-chain Machine Learning model to calculate a daily risk score (0-100) per district.

A signed oracle relayer retrieves this score and pushes it on-chain. The smart contract utilizes this risk score to:
1. Compute a **graduated payout** based on the severity of the risk, rather than a rigid all-or-nothing payout.
2. Dynamically adjust next-cycle premiums based on rolling risk trends.

## Component Architecture

```mermaid
flowchart TD
    subgraph Off-Chain
        ML[ML Risk Model<br/>Python, FastAPI, scikit-learn]
        OR[Oracle Relayer<br/>Node.js, ethers.js]
    end

    subgraph On-Chain (Polygon Amoy)
        SC[Smart Contracts<br/>Solidity, Hardhat]
    end

    subgraph Client
        FE[Frontend dApp<br/>React, Vite, ethers.js]
    end

    %% Flow
    ML -- "1. Exposes Risk Score (0-100) via REST" --> OR
    OR -- "2. Signs Data & Relays Transaction" --> SC
    SC -- "3. Adjusts Premium / Calculates Payout" --> SC
    SC -- "4. Emits Events (RiskScoreUpdated, etc.)" --> FE
    FE -- "5. Reads State & Displays Dashboard" --> SC
    FE -- "6. Farmer Pays Premium / Claims Payout" --> SC
```

## Module Definitions

1. **ML Risk Model**: A predictive model built with Python and scikit-learn, exposed via a FastAPI REST API. It aggregates weather data, satellite imagery, and historical yields to generate a 0-100 risk score per district.
2. **Oracle Relayer**: A Node.js backend using ethers.js. It acts as the bridge between the off-chain API and the on-chain smart contract. It fetches the score, signs it with a trusted private key, and submits it to the smart contract.
3. **Smart Contracts**: Solidity contracts deployed on the Polygon Amoy testnet. They verify the oracle's signature, store the latest risk scores, compute graduated payouts if the score exceeds certain thresholds, and adjust future premiums.
4. **Frontend**: A React application built with Vite. It allows farmers to purchase insurance policies, view their coverage, track district risk scores in real-time, and claim payouts.

## Data Flow

### 1. Risk Assessment & Relay (Daily Cron)
1. **Model Inference**: The ML model computes the daily risk score for District X (e.g., `85`).
2. **Relayer Fetch**: The Oracle Relayer runs a cron job to fetch the score from the FastAPI endpoint: `GET /api/v1/risk/District_X`.
3. **Relayer Sign**: The Oracle Relayer signs the payload `(District_X, 85, timestamp)` with its private key.
4. **Relayer Submit**: The Relayer calls the smart contract function `updateRiskScore` with the data and the cryptographic signature.

### 2. Smart Contract Execution
1. **Verification**: The smart contract recovers the signer from the signature and verifies it matches the authorized oracle address.
2. **State Update**: The risk score for District X is updated on-chain.
3. **Policy Evaluation**: The contract evaluates active policies in District X. If the score is high (e.g., > 70), it computes a graduated payout (e.g., 50% payout at score 70, 100% payout at score 95).
4. **Premium Adjustment**: The rolling average risk score is updated, which adjusts the base premium cost for the next cycle.

### 3. Frontend Interaction
1. **Event Listening**: The frontend listens for the `RiskScoreUpdated` and `PayoutAvailable` events.
2. **Dashboard Update**: The UI reflects the new risk score and alerts the user if a payout is available.
3. **Claiming**: The farmer clicks "Claim", calling the `claimPayout` function on the smart contract.

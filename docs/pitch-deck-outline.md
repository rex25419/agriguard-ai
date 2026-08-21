# Pitch Deck Outline

This outline is structured for a 10-slide Google Slides or PowerPoint presentation. 
*Note: Insert screenshots from `frontend/` (e.g. `hero.png` or dashboard shots) where placeholders are indicated.*

---

## Slide 1: Title
**Title:** AgriGuard AI
**Subtitle:** AI-Driven, Parametric Crop Insurance with Graduated Payouts
**Visual:** `frontend/src/assets/hero.png` (or project logo)

---

## Slide 2: The Problem
**Title:** The Flaw of Binary Triggers
**Content:**
- **Unfair to Farmers:** Single thresholds (e.g., < 100mm rain = payout) ignore partial crop damage. You either get 100% or nothing.
- **Expensive for Insurers:** Actuaries must price premiums extremely high to cover the binary worst-case scenario.
- **Liquidity Delay:** Farmers often wait months for claims adjusters to verify damage.

---

## Slide 3: The Solution
**Title:** Graduated Payouts + Self-Optimizing Premiums
**Content:**
- **Dynamic Risk Score (0-100):** AI models daily drought risk based on weather/soil.
- **Graduated Payout Curve:** Payouts scale with severity (0%, 20%, 60%, 100%).
- **Self-Optimizing:** The `PolicyManager.sol` contract tracks a rolling average of risk scores to dynamically lower future premiums for low-risk districts.

---

## Slide 4: Live Demo
**Title:** AgriGuard in Action (Live Demo)
**Content:**
- *Leave this slide mostly blank for the live demonstration.*
- **Visual:** [Placeholder for Frontend UI Screenshot - Active Policy Dashboard]
- **Talking Track:** Replaying the 30-day Vidarbha drought sequence using `demo-mode.js` and watching the smart contract scale payouts from 0% -> 20% -> 60% -> 100%.

---

## Slide 5: Architecture
**Title:** Decentralized & Verifiable
**Visual:** [Insert Mermaid Architecture Diagram from `docs/architecture-diagram.md`]
**Content:**
- **Off-chain ML:** FastAPI + scikit-learn
- **Oracle Relayer:** Node.js with ECDSA payload signing & Outlier Guard
- **On-chain:** `RiskOracle.sol` (Signature Verification) and `PolicyManager.sol` (Payout Logic) on Polygon Amoy.

---

## Slide 6: AI Differentiation
**Title:** Why AI? Beyond Simple Rainfall
**Content:**
- Simple automation misses the nuance of crop stress (e.g., timing of rain matters more than total volume).
- We use a **Gradient Boosting Regressor** to model temporal relationships.
- **Performance:** R² = 0.93, MAE = 4.69 points.
- **Key Feature Insight:** Consecutive Dry Days (56%) > Absolute Rainfall (35%).

---

## Slide 7: Oracle Integrity
**Title:** Securing the Data Bridge
**Content:**
- **Cryptographic Signatures:** Oracle signs `(districtId, riskScore, timestamp)` using EIP-712 / ECDSA. Smart contract verifies via `ecrecover`.
- **Replay Protection:** Strictly increasing timestamps required on-chain.
- **Outlier Guard:** Relayer halts on sudden >40 point spikes, requiring two consecutive polling confirmations before on-chain submission.

---

## Slide 8: Production Roadmap
**Title:** Next Steps to Mainnet
**Content:**
- **Decentralized Consensus:** Move from a single-node relayer to Chainlink Functions/CRE for multi-node inference consensus.
- **Real-World Data:** Integrate Indian Meteorological Department (IMD) APIs and CHIRPS satellite data.
- **Crop Phenology:** Add specific growth stage sensitivities (e.g., drought during flowering is more penalizing than during vegetative stages).

---

## Slide 9: Team
**Title:** Built By
**Content:**
- [Team Member 1] - Smart Contracts (Solidity/Hardhat)
- [Team Member 2] - ML Pipeline (Python/FastAPI)
- [Team Member 3] - Oracle Relayer (Node.js/Ethers)
- [Team Member 4] - Frontend (React/Vite)

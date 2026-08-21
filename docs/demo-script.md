# Live Demo Script (3 Minutes)

This script is tightly coordinated with `oracle/demo-mode.js` (5s intervals) and the React frontend. It demonstrates the graduation payout triggering dynamically based on worsening drought conditions.

---

### [0:00 - 0:20] Problem Framing
**Speaker:** 
"Traditional parametric insurance is fundamentally unfair and expensive. It relies on a single, rigid binary trigger. If rainfall falls below X, you get a 100% payout. If it's just one millimeter above X, you get zero. This leaves farmers vulnerable to partial crop losses and forces insurers to charge massive premiums to cover worst-case scenarios. AgriGuard AI fixes this with a smart, graduated payout model."

---

### [0:20 - 1:50] Live Walkthrough (Triggering the Payout)
*(Action: Start `node demo-mode.js` in the terminal. Open the Frontend UI Dashboard showing District 1.)*

**Speaker:**
"We're looking at a farmer's active policy in District 1 (Vidarbha). In the background, our Oracle Relayer is polling the ML service. For this demo, we're simulating a 30-day drought sequence compressed into a few seconds."

*(Action: UI updates as the first few scores (6, 20) come in.)*
**Speaker:** 
"The season starts healthy. The risk score is low, so the smart contract payout evaluates to 0%."

*(Action: Score hits 55 at step 3. UI updates to show 20% payout available.)*
**Speaker:** 
"We just crossed the 40-point threshold. The ML model detected moderate stress from a 6-day dry spell. `PolicyManager.sol` dynamically unlocks a 20% partial payout to help the farmer buy emergency irrigation—without waiting for the end of the season."

*(Action: Score hits 74 at step 4. UI updates to show 60% payout available.)*
**Speaker:**
"As the drought worsens to 9 consecutive dry days, the score hits 74. The smart contract automatically scales the available payout to 60%."

*(Action: Score hits 90+ at step 6. UI shows 100% payout and policy deactivated.)*
**Speaker:**
"Finally, the drought becomes catastrophic. Once the risk score crosses 90, the smart contract unlocks the maximum 100% payout and automatically deactivates the policy. By graduating the payouts: (1) Farmers get liquidity *when* they need it, proportional to the damage, and (2) The insurer protects their liquidity pool during minor events."

*(Action: Click the 'Claim' button in the frontend. MetaMask popup appears. Confirm transaction.)*
**Speaker:**
"The farmer clicks claim, and the smart contract executes the transfer instantly, fully transparent on the Polygon Amoy testnet."

---

### [1:50 - 2:30] Why this is AI, not just automation
*(Action: Switch to the ML metrics slide/dashboard showing feature importances)*

**Speaker:**
"This isn't just a simple if-then rainfall statement. We trained a Gradient Boosting Regressor that looks at the nuanced, non-linear relationships of crop stress. It achieved an R² of 0.93 and a Mean Absolute Error of just 4.69 points. 

If you look at our feature importances, *consecutive dry days* (56%) drives the model more than absolute *rainfall* (35%). A single downpour of 50mm on day 1 followed by 29 dry days is disastrous for crops, but a simple rainfall threshold would see 50mm and deny the payout. Our AI captures this temporal reality."

---

### [2:30 - 3:00] Production Roadmap
**Speaker:**
"For the hackathon, we built a single-node relayer with a stateful outlier guard. But for production, we will decentralize the oracle using Chainlink Functions or a Custom Runtime Environment to achieve multi-node consensus on the ML inference. 

We will also replace our synthetic data pipeline with live Indian Meteorological Department (IMD) feeds and CHIRPS satellite imagery, bringing actuarially fair, AI-driven crop insurance to millions of farmers."

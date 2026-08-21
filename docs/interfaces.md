# AgriGuard AI: Module Interfaces

This document defines the strict interfaces between the various modules in the AgriGuard AI system. Developers should use these definitions to stub or mock external dependencies when running their modules in isolation.

## 1. ML Risk Model (FastAPI)

The ML Risk Model exposes a REST API for the Oracle Relayer to fetch the latest risk scores.

### `GET /api/v1/risk/{district_id}`

Fetches the current daily risk score for a given district.

**Response (200 OK):**
```json
{
  "district_id": "string",
  "risk_score": 85, // Integer between 0 and 100
  "timestamp": 1692612345, // Unix timestamp in seconds
  "model_version": "v1.2.0"
}
```

**Response (404 Not Found):**
```json
{
  "error": "District not found"
}
```

---

## 2. Oracle Relayer (Node.js)

The Oracle Relayer signs the data retrieved from the ML Model and pushes it to the smart contract.

### EIP-712 Signature Format

The relayer signs a structured payload using EIP-712 to ensure the data cannot be tampered with.

**Domain Separator:**
- `name`: `"AgriGuardOracle"`
- `version`: `"1"`
- `chainId`: `80002` (Polygon Amoy Testnet)
- `verifyingContract`: `0x...` (Address of the deployed AgriGuard Contract)

**Data Structure (`RiskUpdate`):**
- `district_id` (string)
- `risk_score` (uint8)
- `timestamp` (uint256)

---

## 3. Smart Contract (Solidity)

The smart contract exposes functions for the Oracle to update the state, and for farmers to interact with the insurance system.

### Key Functions

```solidity
interface IAgriGuard {
    /// @notice Updates the risk score for a district (called by Oracle Relayer)
    /// @param district_id The unique identifier for the district
    /// @param risk_score The risk score (0-100)
    /// @param timestamp The time the score was generated
    /// @param signature The EIP-712 signature from the authorized oracle
    function updateRiskScore(
        string calldata district_id,
        uint8 risk_score,
        uint256 timestamp,
        bytes calldata signature
    ) external;

    /// @notice Allows a farmer to purchase a policy for a given district
    /// @param district_id The district the farm is located in
    function purchasePolicy(string calldata district_id) external payable;

    /// @notice Allows a farmer to claim their payout if the risk score warrants it
    /// @param policy_id The ID of the policy to claim
    function claimPayout(uint256 policy_id) external;
    
    /// @notice Gets the rolling average risk score for a district (used for premiums)
    /// @param district_id The district identifier
    /// @return The rolling average risk score
    function getDistrictRiskTrend(string calldata district_id) external view returns (uint8);
}
```

### Events (For Frontend Integration)

The frontend should listen to these events to update the UI dynamically.

```solidity
/// @notice Emitted when the oracle updates a district's risk score
event RiskScoreUpdated(string indexed district_id, uint8 risk_score, uint256 timestamp);

/// @notice Emitted when a risk score update triggers a potential payout for a district
event PayoutAvailable(string indexed district_id, uint8 severity_level);

/// @notice Emitted when a farmer successfully claims a payout
event PayoutClaimed(address indexed farmer, uint256 policy_id, uint256 amount);
```

---

## 4. Frontend Integration

The frontend (React/Vite) should implement the following mock states for offline/standalone development:

1. **Mock Provider**: Use a local Hardhat node (`http://localhost:8545`) with pre-funded accounts.
2. **Contract Stubbing**: If the real contracts aren't deployed, mock the ethers.js `Contract` object to resolve the `purchasePolicy` and `claimPayout` functions successfully, and emit mock `RiskScoreUpdated` events periodically.

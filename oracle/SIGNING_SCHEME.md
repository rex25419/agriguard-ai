# AgriGuard RiskOracle Signing Scheme

This document defines the cryptographic signing scheme used by the Oracle Relayer to submit off-chain ML risk scores to the `RiskOracle` smart contract securely. 

## Payload Definition

The payload being signed consists of three data points:
1. `districtId` (uint256): The unique identifier for the district (e.g., 1, 5).
2. `riskScore` (uint8): The ML-generated risk score (0-100).
3. `timestamp` (uint256): The UNIX timestamp of when the score was generated/fetched.

## Encoding & Hashing (Solidity Equivalent)

The Oracle Relayer hashes the payload using the exact equivalent of Solidity's `keccak256(abi.encodePacked(...))` function:

```solidity
bytes32 messageHash = keccak256(abi.encodePacked(districtId, riskScore, timestamp));
```

### Ethers.js Implementation (Relayer side)

```javascript
const messageHash = ethers.solidityPackedKeccak256(
    ["uint256", "uint8", "uint256"],
    [districtId, riskScore, timestamp]
);
```

## Signature Generation

Once the `messageHash` is derived, the relayer signs it using the Ethereum standard `eth_sign` / `personal_sign` prefix approach (`\x19Ethereum Signed Message:\n32`).

In `ethers.js`, this is handled automatically via `Wallet.signMessage(ethers.getBytes(messageHash))`.

## Smart Contract Verification (`ecrecover`)

The `RiskOracle` smart contract should verify the signature by reconstructing the prefixed hash and recovering the signer.

### Example Solidity Verification

```solidity
function submitRiskScore(
    uint256 districtId,
    uint8 riskScore,
    uint256 timestamp,
    bytes calldata signature
) external {
    // 1. Reconstruct the raw hash
    bytes32 messageHash = keccak256(abi.encodePacked(districtId, riskScore, timestamp));
    
    // 2. Add the Ethereum Signed Message prefix
    bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(messageHash);
    
    // 3. Recover the signer
    address recoveredSigner = ECDSA.recover(ethSignedMessageHash, signature);
    
    // 4. Verify the signer is the authorized oracle relayer
    require(recoveredSigner == ORACLE_ADDRESS, "Invalid signature or unauthorized signer");
    
    // ... proceed to store the risk score
}
```
*Note: We highly recommend using OpenZeppelin's `ECDSA` library for `toEthSignedMessageHash` and `recover`.*

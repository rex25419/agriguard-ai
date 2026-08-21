// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockContract {
    event RiskScoreUpdated(string district, uint8 score);

    function updateRiskScore(string memory district, uint8 score) public {
        emit RiskScoreUpdated(district, score);
    }
}

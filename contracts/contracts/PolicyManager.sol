// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./RiskOracle.sol";

/**
 * @title PolicyManager
 * @notice Parametric crop insurance contract that allows farmers to buy policies and receive
 *         graduated payouts based on an on-chain risk score from RiskOracle.
 *
 * ─── WHY GRADUATED PAYOUTS INSTEAD OF BINARY? ───────────────────────────────────────────────
 * Traditional parametric insurance uses a single trigger threshold: if rainfall < X → full
 * payout; otherwise → nothing. This binary design is inherently unfair:
 *   • A farmer with score 41 and a farmer with score 90 both receive the same 100% payout,
 *     even though their actual crop damage is vastly different.
 *   • Insurers must charge much higher base premiums to cover worst-case scenarios, making
 *     policies unaffordable for marginal-risk farmers.
 *
 * A graduated curve solves both problems:
 *   score < 40   → 0%   payout  (low risk — crops expected healthy)
 *   score 40–69  → 20%  payout  (moderate stress — partial loss expected)
 *   score 70–89  → 60%  payout  (severe stress — significant crop damage)
 *   score 90–100 → 100% payout  (extreme event — near total loss)
 *
 * This means:
 *   (a) Payouts are proportional to likely damage, reducing moral hazard.
 *   (b) The insurer retains a portion of reserves even during moderate events, improving
 *       long-term sustainability of the pool.
 *   (c) Farmers in lower-risk districts pay lower premiums that dynamically decrease as
 *       the rolling average risk trend improves.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─── SELF-OPTIMIZING PREMIUM FEATURE ────────────────────────────────────────────────────────
 * Each district maintains a rolling average of its last 5 risk scores stored on-chain.
 * When a new policy is purchased, the premium = sumInsured * rollingAvg / 1000.
 * As better (lower) scores flow in via the oracle, the rolling average decreases automatically,
 * making future premiums cheaper for consistently low-risk districts. Conversely, districts
 * with deteriorating conditions pay higher premiums — an actuarially fair feedback loop.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
contract PolicyManager is Ownable {
    // ─── Constants ───────────────────────────────────────────────────────────────

    /// @dev Number of historical scores kept per district for rolling-average premium calc.
    uint256 private constant ROLLING_WINDOW = 5;

    /// @dev Default risk basis used when no historical scores exist yet (50 = 5%).
    uint256 private constant DEFAULT_RISK_BASIS = 50;

    // ─── Storage ─────────────────────────────────────────────────────────────────

    /// @notice The deployed RiskOracle this contract reads scores from.
    RiskOracle public immutable riskOracle;

    /// @dev Auto-incrementing policy counter.
    uint256 private _nextPolicyId;

    /// @notice Represents a farmer's insurance policy.
    struct Policy {
        address farmer;
        uint256 districtId;
        string  cropType;
        uint256 sumInsured;      // in wei
        uint256 premiumPaid;     // in wei
        bool    active;
        uint256 lastPayoutEpoch; // timestamp of the last oracle score used for payout
    }

    /// @notice policyId => Policy
    mapping(uint256 => Policy) public policies;

    /// @dev districtId => rolling window of recent risk scores (circular buffer).
    mapping(uint256 => uint256[ROLLING_WINDOW]) private _districtScoreHistory;
    /// @dev districtId => number of scores recorded so far (capped at ROLLING_WINDOW).
    mapping(uint256 => uint256) private _districtScoreCount;
    /// @dev districtId => index of the next slot to overwrite in the circular buffer.
    mapping(uint256 => uint256) private _districtScoreIndex;
    /// @dev districtId => cached rolling average risk (0–100) updated via updateDistrictRiskTrend.
    mapping(uint256 => uint256) private _districtRollingAvg;

    // ─── Events ──────────────────────────────────────────────────────────────────

    event PolicyPurchased(
        uint256 indexed policyId,
        address indexed farmer,
        uint256 indexed districtId,
        string  cropType,
        uint256 sumInsured,
        uint256 premiumPaid
    );

    event PayoutExecuted(
        uint256 indexed policyId,
        uint8           riskScore,
        uint256         payoutAmount
    );

    event FundsReceived(address indexed from, uint256 amount);

    // ─── Constructor ─────────────────────────────────────────────────────────────

    /**
     * @param _riskOracle Address of the deployed RiskOracle contract.
     */
    constructor(address _riskOracle) Ownable(msg.sender) {
        require(_riskOracle != address(0), "PolicyManager: zero oracle address");
        riskOracle = RiskOracle(_riskOracle);
        _nextPolicyId = 1; // start policyIds from 1
    }

    // ─── Payout Pool Management (Owner) ──────────────────────────────────────────

    /**
     * @notice Allows the contract owner to fund the payout pool.
     * @dev The pool is simply this contract's ETH balance. Anyone can view it via
     *      address(this).balance. The owner tops it up before policy purchases begin.
     */
    function fund() external payable onlyOwner {
        emit FundsReceived(msg.sender, msg.value);
    }

    /**
     * @notice Allows the owner to withdraw any remaining unallocated funds from the pool.
     * @param to      Recipient address.
     * @param amount  Amount in wei to withdraw.
     */
    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "PolicyManager: zero recipient");
        require(amount <= address(this).balance, "PolicyManager: insufficient balance");
        to.transfer(amount);
    }

    // ─── Policy Lifecycle ────────────────────────────────────────────────────────

    /**
     * @notice Farmer buys a new crop insurance policy.
     * @dev    Premium = sumInsured * rollingRiskAvg / 1000.
     *         rollingRiskAvg is the district's rolling average risk (0–100, default 50 if
     *         no history). Dividing by 1000 maps a score of 100 to a 10% premium rate.
     *         Example: sumInsured=1 ETH, rollingAvg=50 → premium = 0.05 ETH (5%).
     *
     * @param districtId  District to insure against.
     * @param cropType    Human-readable crop name (e.g., "wheat", "rice").
     * @param sumInsured  Maximum payout amount in wei.
     * @return policyId   The unique ID of the newly created policy.
     */
    function buyPolicy(
        uint256 districtId,
        string calldata cropType,
        uint256 sumInsured
    ) external payable returns (uint256 policyId) {
        require(sumInsured > 0, "PolicyManager: sumInsured must be > 0");

        // Compute required premium using rolling average risk.
        uint256 rollingAvg = _getDistrictRollingAvg(districtId);
        uint256 requiredPremium = (sumInsured * rollingAvg) / 1000;
        // Ensure a minimum premium of 1 wei so zero-risk districts still pay something.
        if (requiredPremium == 0) requiredPremium = 1;

        require(msg.value >= requiredPremium, "PolicyManager: insufficient premium");

        policyId = _nextPolicyId++;
        policies[policyId] = Policy({
            farmer:         msg.sender,
            districtId:     districtId,
            cropType:       cropType,
            sumInsured:     sumInsured,
            premiumPaid:    msg.value,
            active:         true,
            lastPayoutEpoch: 0
        });

        emit PolicyPurchased(policyId, msg.sender, districtId, cropType, sumInsured, msg.value);
    }

    /**
     * @notice Checks the current oracle risk score for a policy's district and pays out
     *         according to the graduated curve if eligible.
     *
     * Graduated Payout Curve (see contract-level NatSpec for the economic rationale):
     *   score < 40   → 0%   payout (no significant crop stress detected)
     *   score 40–69  → 20%  payout (moderate stress tier)
     *   score 70–89  → 60%  payout (severe stress tier)
     *   score 90–100 → 100% payout (catastrophic loss tier; policy deactivated)
     *
     * @param policyId  ID of the policy to evaluate.
     */
    function checkAndPayout(uint256 policyId) external {
        Policy storage p = policies[policyId];
        require(p.farmer != address(0), "PolicyManager: policy does not exist");
        require(p.active, "PolicyManager: policy is not active");

        (uint8 riskScore, uint256 scoreTimestamp) = riskOracle.getLatestScore(p.districtId);
        require(scoreTimestamp > 0, "PolicyManager: no oracle score for district");
        require(
            scoreTimestamp > p.lastPayoutEpoch,
            "PolicyManager: payout already claimed for this oracle epoch"
        );

        // ─── Graduated payout curve ────────────────────────────────────────────
        uint256 payoutAmount;
        if (riskScore < 40) {
            payoutAmount = 0;
        } else if (riskScore < 70) {
            payoutAmount = p.sumInsured * 20 / 100; // 20%
        } else if (riskScore < 90) {
            payoutAmount = p.sumInsured * 60 / 100; // 60%
        } else {
            payoutAmount = p.sumInsured;             // 100%
            p.active = false;                        // catastrophic loss → deactivate
        }
        // ──────────────────────────────────────────────────────────────────────

        // Mark epoch used before any external call (checks-effects-interactions pattern)
        p.lastPayoutEpoch = scoreTimestamp;

        // Also update the district's rolling risk trend with this score (self-optimizing premium)
        updateDistrictRiskTrend(p.districtId, riskScore);

        emit PayoutExecuted(policyId, riskScore, payoutAmount);

        if (payoutAmount > 0) {
            require(address(this).balance >= payoutAmount, "PolicyManager: payout pool exhausted");
            payable(p.farmer).transfer(payoutAmount);
        }
    }

    // ─── Rolling Risk Trend ───────────────────────────────────────────────────────

    /**
     * @notice Updates the rolling average risk for a district by recording a new score.
     * @dev    Maintains a circular buffer of the last ROLLING_WINDOW scores. The resulting
     *         rolling average is cached in _districtRollingAvg[districtId].
     *
     *         This function is public so the oracle relayer (or owner) can call it directly
     *         to keep premium calculations current even for districts with no active policies.
     *         It is also called internally by checkAndPayout every time a payout is evaluated.
     *
     *         ── SELF-OPTIMIZING PREMIUM MECHANISM ──
     *         As oracle scores improve (decrease), the rolling average falls, reducing
     *         future premiums for that district automatically — no admin action required.
     *
     * @param districtId  District to update.
     * @param newScore    New risk score (0–100) to record.
     */
    function updateDistrictRiskTrend(uint256 districtId, uint8 newScore) public {
        require(newScore <= 100, "PolicyManager: score out of range");

        uint256 idx   = _districtScoreIndex[districtId];
        uint256 count = _districtScoreCount[districtId];

        // Write new score into the circular buffer slot.
        _districtScoreHistory[districtId][idx] = newScore;
        _districtScoreIndex[districtId] = (idx + 1) % ROLLING_WINDOW;
        if (count < ROLLING_WINDOW) {
            _districtScoreCount[districtId] = count + 1;
        }

        // Recompute the rolling average over the populated slots.
        uint256 sum = 0;
        uint256 filled = _districtScoreCount[districtId];
        for (uint256 i = 0; i < filled; i++) {
            sum += _districtScoreHistory[districtId][i];
        }
        _districtRollingAvg[districtId] = sum / filled;
    }

    /**
     * @notice Returns the current rolling average risk (0–100) for a district.
     * @param districtId  District to query.
     * @return avg        Rolling average of the last up-to-5 submitted scores.
     */
    function getDistrictRollingAvg(uint256 districtId) external view returns (uint256) {
        return _getDistrictRollingAvg(districtId);
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────────

    function _getDistrictRollingAvg(uint256 districtId) internal view returns (uint256) {
        if (_districtScoreCount[districtId] == 0) {
            return DEFAULT_RISK_BASIS; // default: 50 → 5% premium rate
        }
        return _districtRollingAvg[districtId];
    }

    // ─── Receive / Fallback ───────────────────────────────────────────────────────

    /// @dev Accept plain ETH transfers so the contract can be funded via MetaMask.
    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }
}

// test/AgriGuard.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Test suite for AgriGuard AI — RiskOracle & PolicyManager
 *
 * Coverage:
 *  RiskOracle
 *    ✓ rejects signature from wrong signer (bad oracle key)
 *    ✓ rejects timestamp that is not strictly increasing (replay attack)
 *    ✓ rejects duplicate timestamp for the same district (exact replay)
 *    ✓ rejects timestamp more than 1 hour in the future
 *    ✓ accepts valid signatures and emits RiskScoreUpdated
 *    ✓ getLatestScore returns stored score and timestamp
 *    ✓ rejects score > 100
 *
 *  PolicyManager — premium calculation
 *    ✓ uses DEFAULT_RISK_BASIS (50) when no history exists → 5% rate
 *    ✓ rolling average drops as low scores accumulate
 *    ✓ reverts if msg.value < required premium
 *
 *  PolicyManager — graduated payout tiers (boundary values)
 *    ✓ score 39 → 0% payout
 *    ✓ score 40 → 20% payout
 *    ✓ score 69 → 20% payout
 *    ✓ score 70 → 60% payout
 *    ✓ score 89 → 60% payout
 *    ✓ score 90 → 100% payout + policy deactivated
 *    ✓ score 100 → 100% payout + policy deactivated
 *
 *  PolicyManager — double payout prevention
 *    ✓ checkAndPayout reverts on same oracle epoch (same timestamp)
 *    ✓ checkAndPayout succeeds after oracle submits a new (later) score
 */

describe("RiskOracle", function () {
  let oracle;
  let oracleWallet; // the authorized signer
  let attacker;
  let districtId;
  let baseTs;

  async function signRiskScore(wallet, districtId, score, ts) {
    const msgHash = ethers.solidityPackedKeccak256(
      ["uint256", "uint8", "uint256"],
      [districtId, score, ts]
    );
    return wallet.signMessage(ethers.getBytes(msgHash));
  }

  beforeEach(async function () {
    [, attacker] = await ethers.getSigners();
    oracleWallet = ethers.Wallet.createRandom();

    const RiskOracle = await ethers.getContractFactory("RiskOracle");
    oracle = await RiskOracle.deploy(oracleWallet.address);

    districtId = 1;
    baseTs = Math.floor(Date.now() / 1000) - 60; // 1 minute ago → safe
  });

  it("reverts when signature is from a wrong (unauthorized) signer", async function () {
    const sig = await signRiskScore(attacker, districtId, 55, baseTs);
    await expect(
      oracle.connect(attacker).submitRiskScore(districtId, 55, baseTs, sig)
    ).to.be.revertedWith("RiskOracle: invalid signature (bad signer)");
  });

  it("reverts when score > 100", async function () {
    const ts = baseTs;
    const sig = await signRiskScore(oracleWallet, districtId, 101, ts);
    await expect(
      oracle.submitRiskScore(districtId, 101, ts, sig)
    ).to.be.revertedWith("RiskOracle: score out of range");
  });

  it("reverts when timestamp is NOT strictly increasing (replay / stale)", async function () {
    // Submit first score successfully
    const ts1 = baseTs;
    const sig1 = await signRiskScore(oracleWallet, districtId, 30, ts1);
    await oracle.submitRiskScore(districtId, 30, ts1, sig1);

    // Try to replay with the same timestamp
    const sig2 = await signRiskScore(oracleWallet, districtId, 45, ts1);
    await expect(
      oracle.submitRiskScore(districtId, 45, ts1, sig2)
    ).to.be.revertedWith("RiskOracle: timestamp not strictly increasing (replay protection)");

    // Try to replay with an earlier timestamp
    const ts0 = ts1 - 1;
    const sig3 = await signRiskScore(oracleWallet, districtId, 45, ts0);
    await expect(
      oracle.submitRiskScore(districtId, 45, ts0, sig3)
    ).to.be.revertedWith("RiskOracle: timestamp not strictly increasing (replay protection)");
  });

  it("reverts when timestamp is more than 1 hour in the future", async function () {
    const futureTs = Math.floor(Date.now() / 1000) + 3700; // now + >1h
    const sig = await signRiskScore(oracleWallet, districtId, 50, futureTs);
    await expect(
      oracle.submitRiskScore(districtId, 50, futureTs, sig)
    ).to.be.revertedWith("RiskOracle: timestamp too far in the future (freshness check)");
  });

  it("accepts a valid signed score and emits RiskScoreUpdated", async function () {
    const sig = await signRiskScore(oracleWallet, districtId, 72, baseTs);
    await expect(oracle.submitRiskScore(districtId, 72, baseTs, sig))
      .to.emit(oracle, "RiskScoreUpdated")
      .withArgs(districtId, 72, baseTs);
  });

  it("getLatestScore returns the stored score and timestamp", async function () {
    const sig = await signRiskScore(oracleWallet, districtId, 55, baseTs);
    await oracle.submitRiskScore(districtId, 55, baseTs, sig);
    const [score, ts] = await oracle.getLatestScore(districtId);
    expect(score).to.equal(55);
    expect(ts).to.equal(baseTs);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────

describe("PolicyManager", function () {
  let oracle;
  let policyMgr;
  let oracleWallet;
  let owner;
  let farmer;
  let districtId;

  const sumInsured = ethers.parseEther("1.0"); // 1 ETH

  async function signRiskScore(wallet, districtId, score, ts) {
    const msgHash = ethers.solidityPackedKeccak256(
      ["uint256", "uint8", "uint256"],
      [districtId, score, ts]
    );
    return wallet.signMessage(ethers.getBytes(msgHash));
  }

  /** Submit a signed score to the oracle. Returns the used timestamp. */
  async function pushScore(score, tsOffset = 0) {
    const ts = Math.floor(Date.now() / 1000) - 60 + tsOffset;
    const sig = await signRiskScore(oracleWallet, districtId, score, ts);
    await oracle.submitRiskScore(districtId, score, ts, sig);
    return ts;
  }

  beforeEach(async function () {
    [owner, farmer] = await ethers.getSigners();
    oracleWallet = ethers.Wallet.createRandom();
    districtId = 42;

    const RiskOracle = await ethers.getContractFactory("RiskOracle");
    oracle = await RiskOracle.deploy(oracleWallet.address);

    const PolicyManager = await ethers.getContractFactory("PolicyManager");
    policyMgr = await PolicyManager.deploy(await oracle.getAddress());

    // Fund the payout pool with 10 ETH so payouts can proceed.
    await policyMgr.connect(owner).fund({ value: ethers.parseEther("10") });
  });

  // ─── Premium Calculation Tests ───────────────────────────────────────────────

  describe("Premium calculation", function () {
    it("uses DEFAULT_RISK_BASIS (50) when no history exists → 5% premium rate", async function () {
      // rollingAvg = 50 (default) → premium = 1 ETH * 50 / 1000 = 0.05 ETH
      const expectedPremium = (sumInsured * 50n) / 1000n;
      const tx = policyMgr.connect(farmer).buyPolicy(districtId, "wheat", sumInsured, {
        value: expectedPremium,
      });
      await expect(tx).to.emit(policyMgr, "PolicyPurchased");
    });

    it("reverts if msg.value is less than the required premium", async function () {
      // Required premium is 0.05 ETH; send 0.01 ETH
      const tooLittle = ethers.parseEther("0.01");
      await expect(
        policyMgr.connect(farmer).buyPolicy(districtId, "wheat", sumInsured, {
          value: tooLittle,
        })
      ).to.be.revertedWith("PolicyManager: insufficient premium");
    });

    it("rolling average drops when low scores are fed in", async function () {
      // Seed 5 low scores (10 each) → rolling avg = 10 → premium = 1%
      for (let i = 0; i < 5; i++) {
        await policyMgr.connect(owner).updateDistrictRiskTrend(districtId, 10);
      }
      const avg = await policyMgr.getDistrictRollingAvg(districtId);
      expect(avg).to.equal(10);

      // premium = 1 ETH * 10 / 1000 = 0.01 ETH
      const expectedPremium = (sumInsured * 10n) / 1000n;
      const tx = policyMgr.connect(farmer).buyPolicy(districtId, "rice", sumInsured, {
        value: expectedPremium,
      });
      await expect(tx).to.emit(policyMgr, "PolicyPurchased");
    });
  });

  // ─── Graduated Payout Tier Tests ─────────────────────────────────────────────

  describe("Graduated payout tiers (boundary values)", function () {
    let policyId;
    const premium = ethers.parseEther("0.05"); // 5% of 1 ETH

    beforeEach(async function () {
      // Buy a policy
      const tx = await policyMgr.connect(farmer).buyPolicy(districtId, "wheat", sumInsured, {
        value: premium,
      });
      const receipt = await tx.wait();
      // Extract policyId from PolicyPurchased event
      const ev = receipt.logs
        .map((l) => { try { return policyMgr.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "PolicyPurchased");
      policyId = ev.args.policyId;
    });

    async function checkPayoutForScore(score, expectedPayoutEth, expectedActive = true) {
      // Each test needs a fresh policy for a unique district so epoch tracking doesn't clash.
      const freshDistrict = score * 1000 + Math.floor(Math.random() * 1000);

      const tx = await policyMgr.connect(farmer).buyPolicy(freshDistrict, "wheat", sumInsured, {
        value: premium,
      });
      const receipt = await tx.wait();
      const ev = receipt.logs
        .map((l) => { try { return policyMgr.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "PolicyPurchased");
      const pid = ev.args.policyId;

      // Push a score for the fresh district
      const ts = Math.floor(Date.now() / 1000) - 60 + score; // unique ts per score
      const sig = await signRiskScore(oracleWallet, freshDistrict, score, ts);
      await oracle.submitRiskScore(freshDistrict, score, ts, sig);

      const farmerBefore = await ethers.provider.getBalance(farmer.address);
      const payoutTx = await policyMgr.checkAndPayout(pid);
      const payoutReceipt = await payoutTx.wait();

      // Verify event
      const payoutEv = payoutReceipt.logs
        .map((l) => { try { return policyMgr.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "PayoutExecuted");

      expect(payoutEv.args.riskScore).to.equal(score);
      expect(payoutEv.args.payoutAmount).to.equal(expectedPayoutEth);

      // Verify policy active status
      const policy = await policyMgr.policies(pid);
      expect(policy.active).to.equal(expectedActive);
    }

    it("score 39 → 0% payout, policy stays active", async function () {
      await checkPayoutForScore(39, 0n, true);
    });

    it("score 40 → 20% payout (tier boundary), policy stays active", async function () {
      await checkPayoutForScore(40, (sumInsured * 20n) / 100n, true);
    });

    it("score 69 → 20% payout (upper moderate boundary), policy stays active", async function () {
      await checkPayoutForScore(69, (sumInsured * 20n) / 100n, true);
    });

    it("score 70 → 60% payout (tier boundary), policy stays active", async function () {
      await checkPayoutForScore(70, (sumInsured * 60n) / 100n, true);
    });

    it("score 89 → 60% payout (upper severe boundary), policy stays active", async function () {
      await checkPayoutForScore(89, (sumInsured * 60n) / 100n, true);
    });

    it("score 90 → 100% payout + policy deactivated", async function () {
      await checkPayoutForScore(90, sumInsured, false);
    });

    it("score 100 → 100% payout + policy deactivated", async function () {
      await checkPayoutForScore(100, sumInsured, false);
    });
  });

  // ─── Double Payout Prevention ────────────────────────────────────────────────

  describe("Double payout prevention", function () {
    let policyId;
    let usedTs;
    const premium = ethers.parseEther("0.05");

    beforeEach(async function () {
      // Use a dedicated district to avoid ts conflicts with other tests
      const d = 9999;
      const tx = await policyMgr.connect(farmer).buyPolicy(d, "corn", sumInsured, {
        value: premium,
      });
      const receipt = await tx.wait();
      const ev = receipt.logs
        .map((l) => { try { return policyMgr.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "PolicyPurchased");
      policyId = ev.args.policyId;

      // Push a moderate risk score
      usedTs = Math.floor(Date.now() / 1000) - 60;
      const sig = await signRiskScore(oracleWallet, d, 50, usedTs);
      await oracle.submitRiskScore(d, 50, usedTs, sig);
    });

    it("reverts on second checkAndPayout call with the same oracle epoch", async function () {
      // First call should succeed (score 50 → 20% payout)
      await policyMgr.checkAndPayout(policyId);

      // Second call on the same oracle timestamp must revert
      await expect(policyMgr.checkAndPayout(policyId)).to.be.revertedWith(
        "PolicyManager: payout already claimed for this oracle epoch"
      );
    });

    it("allows a second payout after oracle submits a newer score", async function () {
      // Claim first payout
      await policyMgr.checkAndPayout(policyId);

      // Oracle pushes a new, later score
      const d = 9999;
      const ts2 = usedTs + 3600; // 1 hour later
      const sig2 = await signRiskScore(oracleWallet, d, 55, ts2);
      await oracle.submitRiskScore(d, 55, ts2, sig2);

      // Second checkAndPayout should succeed with the new epoch
      await expect(policyMgr.checkAndPayout(policyId)).to.emit(policyMgr, "PayoutExecuted");
    });
  });
});

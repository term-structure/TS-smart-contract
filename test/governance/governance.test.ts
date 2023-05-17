import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Wallet } from "ethers";
import { deployAndInit } from "../utils/deployAndInit";
import { useFacet } from "../../utils/useFacet";
import { DEFAULT_ZERO_ADDR, FACET_NAMES } from "../../utils/config";
import { whiteListBaseTokens } from "../utils/whitelistToken";
import { GovernanceFacet, TokenFacet, ZkTrueUp } from "../../typechain-types";

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES);
  const diamondToken = (await useFacet(
    "TokenFacet",
    res.zkTrueUp
  )) as TokenFacet;
  await whiteListBaseTokens(
    res.baseTokenAddresses,
    res.priceFeeds,
    diamondToken,
    res.operator
  );
  return res;
};

describe("Governance", () => {
  let [user1]: Signer[] = [];
  let zkTrueUp: ZkTrueUp;
  let diamondGov: GovernanceFacet;
  let admin: Signer;
  let treasuryAddr: string;
  let insuranceAddr: string;
  let vaultAddr: string;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1] = await ethers.getSigners();
    zkTrueUp = res.zkTrueUp;
    admin = res.admin;
    diamondGov = (await useFacet(
      "GovernanceFacet",
      zkTrueUp
    )) as GovernanceFacet;
    treasuryAddr = res.treasury.address;
    insuranceAddr = res.insurance.address;
    vaultAddr = res.vault.address;
  });
  describe("Set & Get fund weight", () => {
    it("Success to set & get fund weight", async () => {
      const newFundWeight = {
        treasury: 5000,
        insurance: 2500,
        vault: 2500,
      };
      const setFundWeightTx = await diamondGov
        .connect(admin)
        .setFundWeight(newFundWeight);
      await setFundWeightTx.wait();

      const fundWeight = await diamondGov.getFundWeight();
      expect(fundWeight.treasury).to.be.equal(newFundWeight.treasury);
      expect(fundWeight.insurance).to.be.equal(newFundWeight.insurance);
      expect(fundWeight.vault).to.be.equal(newFundWeight.vault);
    });
    it("Fail to set fund weight, sender is not admin", async () => {
      const newFundWeight = {
        treasury: 5000,
        insurance: 2500,
        vault: 2500,
      };
      await expect(diamondGov.connect(user1).setFundWeight(newFundWeight)).to.be
        .reverted;
    });
    it("Fail to set fund weight, sum of fund weight is not 10000", async () => {
      const invalidFundWeight = {
        treasury: 3000,
        insurance: 2500,
        vault: 2500,
      };
      await expect(
        diamondGov.connect(admin).setFundWeight(invalidFundWeight)
      ).to.be.revertedWithCustomError(diamondGov, "InvalidFundWeight");
    });
  });

  describe("Set & Get treasury address", () => {
    it("Success to set & get treasury address", async () => {
      const newTreasuryAddr = Wallet.createRandom().address;
      await diamondGov.connect(admin).setTreasuryAddr(newTreasuryAddr);
      expect(await diamondGov.getTreasuryAddr()).to.be.equal(newTreasuryAddr);
    });
    it("Fail to set treasury address, sender is not admin", async () => {
      const newTreasuryAddr = Wallet.createRandom().address;
      await expect(diamondGov.connect(user1).setTreasuryAddr(newTreasuryAddr))
        .to.be.reverted;
    });
    it("Fail to set treasury address, treasury address is zero address", async () => {
      await expect(
        diamondGov.connect(admin).setTreasuryAddr(DEFAULT_ZERO_ADDR)
      ).to.be.revertedWithCustomError(diamondGov, "InvalidZeroAddr");
    });
  });
  describe("Set & Get insurance address", () => {
    it("Success to set & get insurance address", async () => {
      const newInsuranceAddr = Wallet.createRandom().address;
      await diamondGov.connect(admin).setInsuranceAddr(newInsuranceAddr);
      expect(await diamondGov.getInsuranceAddr()).to.be.equal(newInsuranceAddr);
    });
    it("Fail to set insurance address, sender is not admin", async () => {
      const newInsuranceAddr = Wallet.createRandom().address;
      await expect(diamondGov.connect(user1).setInsuranceAddr(newInsuranceAddr))
        .to.be.reverted;
    });
    it("Fail to set insurance address, insurance address is zero address", async () => {
      await expect(
        diamondGov.connect(admin).setInsuranceAddr(DEFAULT_ZERO_ADDR)
      ).to.be.revertedWithCustomError(diamondGov, "InvalidZeroAddr");
    });
  });
  describe("Set & Get vault address", () => {
    it("Success to set & get vault address", async () => {
      const newVaultAddr = Wallet.createRandom().address;
      await diamondGov.connect(admin).setVaultAddr(newVaultAddr);
      expect(await diamondGov.getVaultAddr()).to.be.equal(newVaultAddr);
    });
    it("Fail to set vault address, sender is not admin", async () => {
      const newVaultAddr = Wallet.createRandom().address;
      await expect(diamondGov.connect(user1).setVaultAddr(newVaultAddr)).to.be
        .reverted;
    });
    it("Fail to set vault address, vault address is zero address", async () => {
      await expect(
        diamondGov.connect(admin).setVaultAddr(DEFAULT_ZERO_ADDR)
      ).to.be.revertedWithCustomError(diamondGov, "InvalidZeroAddr");
    });
  });
});

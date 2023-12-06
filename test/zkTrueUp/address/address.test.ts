import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer, Wallet } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { DEFAULT_ZERO_ADDR, FACET_NAMES } from "../../../utils/config";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import {
  AddressFacet,
  EvacuVerifier,
  TokenFacet,
  Verifier,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES);
  const diamondToken = (await useFacet(
    "TokenFacet",
    res.zkTrueUp.address
  )) as TokenFacet;
  await whiteListBaseTokens(
    res.baseTokenAddresses,
    res.priceFeeds,
    diamondToken,
    res.operator
  );
  return res;
};

describe("Address", () => {
  let [user1]: Signer[] = [];
  let zkTrueUp: ZkTrueUp;
  let diamondAddr: AddressFacet;
  let admin: Signer;
  let verifier: Verifier;
  let evacuVerifier: EvacuVerifier;
  let weth: WETH9;
  let poseidonUnit2: Contract;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1] = await ethers.getSigners();
    admin = res.admin;
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAddr = (await useFacet(
      "AddressFacet",
      zkTrueUpAddr
    )) as AddressFacet;
    verifier = res.verifier;
    evacuVerifier = res.evacuVerifier;
    weth = res.weth;
    poseidonUnit2 = res.poseidonUnit2Contract;
  });
  describe("Get address", () => {
    it("Success to get address", async () => {
      const verifierAddr = await diamondAddr.getVerifier();
      const evacuVerifierAddr = await diamondAddr.getEvacuVerifier();
      const poseidonUnit2Addr = await diamondAddr.getPoseidonUnit2();
      const wethAddr = await diamondAddr.getWETH();
      const aaveV3PoolAddr = await diamondAddr.getAaveV3Pool();

      expect(verifierAddr).to.be.equal(verifier.address);
      expect(evacuVerifierAddr).to.be.equal(evacuVerifier.address);
      expect(poseidonUnit2Addr).to.be.equal(poseidonUnit2.address);
      expect(wethAddr).to.be.equal(weth.address);
      expect(aaveV3PoolAddr).to.be.equal(
        "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
      );
    });
  });
  describe("Set & Get verifier", () => {
    it("Success to set & get verifier", async () => {
      const newVerifier = Wallet.createRandom().address;
      const setVerifiertTx = await diamondAddr
        .connect(admin)
        .setVerifier(newVerifier);
      await setVerifiertTx.wait();

      expect(newVerifier).to.be.equal(await diamondAddr.getVerifier());
    });
    it("Success to set & get evacuVerifier", async () => {
      const newVerifier = Wallet.createRandom().address;
      const setVerifiertTx = await diamondAddr
        .connect(admin)
        .setEvacuVerifier(newVerifier);
      await setVerifiertTx.wait();

      expect(newVerifier).to.be.equal(await diamondAddr.getEvacuVerifier());
    });
    it("Fail to set verifier, sender is not admin", async () => {
      const newVerifier = Wallet.createRandom().address;
      await expect(diamondAddr.connect(user1).setVerifier(newVerifier)).to.be
        .reverted;
    });
    it("Fail to set verifier, address is 0", async () => {
      const newVerifier = DEFAULT_ZERO_ADDR;
      await expect(
        diamondAddr.connect(admin).setVerifier(newVerifier)
      ).to.be.revertedWithCustomError(diamondAddr, "InvalidZeroAddr");
    });
    it("Fail to set evacuVerifier, sender is not admin", async () => {
      const newVerifier = Wallet.createRandom().address;
      await expect(diamondAddr.connect(user1).setEvacuVerifier(newVerifier)).to
        .be.reverted;
    });
    it("Fail to set evacuVerifier, address is 0", async () => {
      const newVerifier = DEFAULT_ZERO_ADDR;
      await expect(
        diamondAddr.connect(admin).setEvacuVerifier(newVerifier)
      ).to.be.revertedWithCustomError(diamondAddr, "InvalidZeroAddr");
    });
  });

  // describe("Set & Get treasury address", () => {
  //   it("Success to set & get treasury address", async () => {
  //     const newTreasuryAddr = Wallet.createRandom().address;
  //     await diamondProtocolParams
  //       .connect(admin)
  //       .setTreasuryAddr(newTreasuryAddr);
  //     expect(await diamondProtocolParams.getTreasuryAddr()).to.be.equal(
  //       newTreasuryAddr
  //     );
  //   });
  //   it("Fail to set treasury address, sender is not admin", async () => {
  //     const newTreasuryAddr = Wallet.createRandom().address;
  //     await expect(
  //       diamondProtocolParams.connect(user1).setTreasuryAddr(newTreasuryAddr)
  //     ).to.be.reverted;
  //   });
  //   it("Fail to set treasury address, treasury address is zero address", async () => {
  //     await expect(
  //       diamondProtocolParams.connect(admin).setTreasuryAddr(DEFAULT_ZERO_ADDR)
  //     ).to.be.revertedWithCustomError(diamondProtocolParams, "InvalidZeroAddr");
  //   });
  // });
  // describe("Set & Get insurance address", () => {
  //   it("Success to set & get insurance address", async () => {
  //     const newInsuranceAddr = Wallet.createRandom().address;
  //     await diamondProtocolParams
  //       .connect(admin)
  //       .setInsuranceAddr(newInsuranceAddr);
  //     expect(await diamondProtocolParams.getInsuranceAddr()).to.be.equal(
  //       newInsuranceAddr
  //     );
  //   });
  //   it("Fail to set insurance address, sender is not admin", async () => {
  //     const newInsuranceAddr = Wallet.createRandom().address;
  //     await expect(
  //       diamondProtocolParams.connect(user1).setInsuranceAddr(newInsuranceAddr)
  //     ).to.be.reverted;
  //   });
  //   it("Fail to set insurance address, insurance address is zero address", async () => {
  //     await expect(
  //       diamondProtocolParams.connect(admin).setInsuranceAddr(DEFAULT_ZERO_ADDR)
  //     ).to.be.revertedWithCustomError(diamondProtocolParams, "InvalidZeroAddr");
  //   });
  // });
  // describe("Set & Get vault address", () => {
  //   it("Success to set & get vault address", async () => {
  //     const newVaultAddr = Wallet.createRandom().address;
  //     await diamondProtocolParams.connect(admin).setVaultAddr(newVaultAddr);
  //     expect(await diamondProtocolParams.getVaultAddr()).to.be.equal(
  //       newVaultAddr
  //     );
  //   });
  //   it("Fail to set vault address, sender is not admin", async () => {
  //     const newVaultAddr = Wallet.createRandom().address;
  //     await expect(
  //       diamondProtocolParams.connect(user1).setVaultAddr(newVaultAddr)
  //     ).to.be.reverted;
  //   });
  //   it("Fail to set vault address, vault address is zero address", async () => {
  //     await expect(
  //       diamondProtocolParams.connect(admin).setVaultAddr(DEFAULT_ZERO_ADDR)
  //     ).to.be.revertedWithCustomError(diamondProtocolParams, "InvalidZeroAddr");
  //   });
  // });
});

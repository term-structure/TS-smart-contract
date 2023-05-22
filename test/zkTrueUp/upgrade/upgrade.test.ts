import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BaseContract, Signer } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import { diamondCut } from "../../../utils/diamondCut";
import {
  AccountFacet,
  AccountFacet__factory,
  TokenFacet,
  UpgradeMockFacet,
  UpgradeMockFacet__factory,
  ZkTrueUp,
} from "../../../typechain-types";

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

describe("Upgrade diamond", function () {
  let [user1, invalidSigner]: Signer[] = [];
  let [user1Addr]: string[] = [];
  let admin: Signer;
  let deployer: Signer;
  let zkTrueUp: ZkTrueUp;
  let facets: { [key: string]: BaseContract } = {};
  let fnSelectors: { [key: string]: string[] } = {};

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1, invalidSigner] = await ethers.getSigners();
    [user1Addr] = await Promise.all([user1.getAddress()]);
    admin = res.admin;
    deployer = res.deployer;
    zkTrueUp = res.zkTrueUp;
    facets = res.facets;
    fnSelectors = res.fnSelectors;
  });

  describe("Add facet", function () {
    let UpgradeMockFacet: UpgradeMockFacet__factory;
    let upgradeMockFacet: UpgradeMockFacet;
    beforeEach(async function () {
      UpgradeMockFacet = await ethers.getContractFactory(
        "UpgradeMockFacet",
        deployer
      );
      upgradeMockFacet = await UpgradeMockFacet.deploy();
      await upgradeMockFacet.deployed();
    });
    it("Failed to add facet, invalid signer (not admin)", async function () {
      await expect(
        diamondCut(
          deployer,
          zkTrueUp,
          upgradeMockFacet.address,
          UpgradeMockFacet
        )
      ).to.be.revertedWithCustomError(zkTrueUp, "Ownable__NotOwner");
    });
    it("Failed to add facet, invalid function selector (0 selector)", async function () {
      const mockFacet = {
        target: await invalidSigner.getAddress(),
        action: 0, // add
        selectors: [],
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__SelectorNotSpecified"
      );
    });
    it("Failed to add facet, invalid function selector (have the same function selector is added)", async function () {
      // deploy the same facet
      const AccountFacetFactory = await ethers.getContractFactory(
        "AccountFacet"
      );
      const accountFacet = await AccountFacetFactory.connect(deployer).deploy();
      await accountFacet.deployed();
      const selectors = Object.keys(accountFacet.interface.functions).map(
        (fn) => accountFacet.interface.getSighash(fn)
      );
      const duplicateFacet = {
        target: accountFacet.address,
        action: 0, // add
        selectors: selectors,
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([duplicateFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__SelectorAlreadyAdded"
      );
    });
    it("Failed to add facet, invalid facet address (target not a contract)", async function () {
      const mockFnSelector = "0x12345678";
      const mockFacet = {
        target: await invalidSigner.getAddress(),
        action: 0,
        selectors: [mockFnSelector],
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__TargetHasNoCode"
      );
    });
    it("Success to add facet", async function () {
      const NewFacet = await ethers.getContractFactory("UpgradeMockFacet");
      const newFacet = await NewFacet.connect(deployer).deploy();
      await newFacet.deployed();
      const newFacetFnSelectors = Object.keys(newFacet.interface.functions).map(
        (fn) => newFacet.interface.getSighash(fn)
      );
      const upgradeMockFacet = {
        target: newFacet.address,
        action: 0, // add
        selectors: newFacetFnSelectors,
      };
      await zkTrueUp
        .connect(admin)
        .diamondCut([upgradeMockFacet], ethers.constants.AddressZero, "0x");

      // check that new facet function selectors are registered
      expect(
        await zkTrueUp.facetFunctionSelectors(newFacet.address)
      ).have.members(newFacetFnSelectors);
      // check that new function selectors are registered to new facet address
      for (let i = 0; i < newFacetFnSelectors.length; i++) {
        expect(await zkTrueUp.facetAddress(newFacetFnSelectors[i])).to.equal(
          newFacet.address
        );
      }

      // call new facet function
      const diamondUpgradeMockFacet = (await useFacet(
        "UpgradeMockFacet",
        zkTrueUp
      )) as UpgradeMockFacet;

      // check the new facet function is called successfully
      await diamondUpgradeMockFacet.connect(admin).setValue(1);
      await diamondUpgradeMockFacet.connect(admin).setAddress(user1Addr);
      expect(await diamondUpgradeMockFacet.getValue()).to.equal(1);
      expect(await diamondUpgradeMockFacet.getAddress()).to.equal(user1Addr);
    });
  });

  describe("Replace facet", function () {
    let NewAccountFacet: AccountFacet__factory;
    let newAccountFacet: AccountFacet;
    let newAccountFacetFnSelectors: string[];
    beforeEach(async function () {
      // deploy new AccountFacet
      NewAccountFacet = await ethers.getContractFactory("AccountFacet");
      newAccountFacet = await NewAccountFacet.connect(deployer).deploy();
      await newAccountFacet.deployed();
      newAccountFacetFnSelectors = Object.keys(
        newAccountFacet.interface.functions
      ).map((fn) => newAccountFacet.interface.getSighash(fn));
    });
    it("Failed to replace facet, invalid selector (selector not found)", async function () {
      const mockFnSelector = "0x12345678";
      const mockFacet = {
        target: newAccountFacet.address,
        action: 1, // replace
        selectors: [mockFnSelector],
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__SelectorNotFound"
      );
    });
    it("Failed to replace facet, invalid selector (cannot replace the selector on diamond itself)", async function () {
      const NewZkTrueUp = await ethers.getContractFactory("ZkTrueUp");
      const newZkTrueUp = await NewZkTrueUp.connect(deployer).deploy();
      await newZkTrueUp.deployed();
      const immutableFnSelectors = Object.keys(
        newZkTrueUp.interface.functions
      ).map((fn) => newZkTrueUp.interface.getSighash(fn));
      const mockFacet = {
        target: newZkTrueUp.address,
        action: 1, // replace
        selectors: immutableFnSelectors,
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__SelectorIsImmutable"
      );
    });
    it("Failed to replace facet, invalid facet address (target not a contract)", async function () {
      const mockFnSelector = "0x12345678";
      const mockFacet = {
        target: await invalidSigner.getAddress(),
        action: 1, // replace
        selectors: [mockFnSelector],
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__TargetHasNoCode"
      );
    });
    it("Failed to replace facet, invalid facet address (target address is already registered)", async function () {
      const accountFacet = facets["AccountFacet"];
      const accountFnSelectors = fnSelectors["AccountFacet"];
      const mockFacet = {
        target: accountFacet.address,
        action: 1, // replace
        selectors: accountFnSelectors,
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__ReplaceTargetIsIdentical"
      );
    });
    it("Success to replace facet", async function () {
      const replacedFacet = {
        target: newAccountFacet.address,
        action: 1, // replace
        selectors: newAccountFacetFnSelectors,
      };
      await zkTrueUp
        .connect(admin)
        .diamondCut([replacedFacet], ethers.constants.AddressZero, "0x");

      // check that new facet function selectors are registered
      expect(
        await zkTrueUp.facetFunctionSelectors(newAccountFacet.address)
      ).have.members(newAccountFacetFnSelectors);
      // check that new function selectors are registered to new facet address
      for (let i = 0; i < newAccountFacetFnSelectors.length; i++) {
        expect(
          await zkTrueUp.facetAddress(newAccountFacetFnSelectors[i])
        ).to.equal(newAccountFacet.address);
      }

      // check the new facet function works and the storage is not changed
      const diamondAcc = (await useFacet(
        "AccountFacet",
        zkTrueUp
      )) as AccountFacet;
      const accountNum = await diamondAcc.getAccountNum();
      expect(accountNum).to.equal(1);
    });
  });
  describe("Remove facet", function () {
    it("Failed to remove facet, invalid facet target (target address should be 0 when remove)", async function () {
      const mockFnSelector = "0x12345678";
      const mockFacet = {
        target: facets["AccountFacet"].address,
        action: 2, // remove
        selectors: [mockFnSelector],
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__RemoveTargetNotZeroAddress"
      );
    });
    it("Failed to remove facet, invalid selector (selector nor found)", async function () {
      const mockFnSelector = "0x12345678";
      const mockFacet = {
        target: ethers.constants.AddressZero,
        action: 2, // remove
        selectors: [mockFnSelector],
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__SelectorNotFound"
      );
    });
    it("Failed to remove facet, invalid selector (cannot remove the selector on diamond itself)", async function () {
      const ZkTrueUp = await ethers.getContractFactory("ZkTrueUp");
      const immutableFnSelectors = Object.keys(
        ZkTrueUp.interface.functions
      ).map((fn) => ZkTrueUp.interface.getSighash(fn));
      const mockFacet = {
        target: ethers.constants.AddressZero,
        action: 2, // remove
        selectors: immutableFnSelectors,
      };
      await expect(
        zkTrueUp
          .connect(admin)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(
        zkTrueUp,
        "DiamondWritable__SelectorIsImmutable"
      );
    });
    it("Success to remove facet", async function () {
      const accountFnSelectors = fnSelectors["AccountFacet"];
      const removedFacet = {
        target: ethers.constants.AddressZero,
        action: 2, // remove
        selectors: accountFnSelectors,
      };
      await zkTrueUp
        .connect(admin)
        .diamondCut([removedFacet], ethers.constants.AddressZero, "0x");

      // check that removed facet function selectors are removed
      expect(
        await zkTrueUp.facetFunctionSelectors(facets["AccountFacet"].address)
      ).to.be.empty;
      // check that removed function selectors are removed
      for (let i = 0; i < accountFnSelectors.length; i++) {
        expect(await zkTrueUp.facetAddress(accountFnSelectors[i])).to.equal(
          ethers.constants.AddressZero
        );
      }
    });
  });
});

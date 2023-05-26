import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import {
  TokenFacet,
  UpgradeMockFacet,
  UpgradeMockFacet__factory,
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

describe("Upgrade diamond", function () {
  let [user1, invalidSigner]: Signer[] = [];
  let [user1Addr]: string[] = [];
  let admin: Signer;
  let deployer: Signer;
  let zkTrueUp: ZkTrueUp;
  let UpgradeMockFacet: UpgradeMockFacet__factory;
  let upgradeMockFacet: UpgradeMockFacet;
  let upgradeMockFacetSelectors: string[];

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1, invalidSigner] = await ethers.getSigners();
    [user1Addr] = await Promise.all([user1.getAddress()]);
    admin = res.admin;
    deployer = res.deployer;
    zkTrueUp = res.zkTrueUp;
    UpgradeMockFacet = await ethers.getContractFactory(
      "UpgradeMockFacet",
      deployer
    );
    upgradeMockFacet = await UpgradeMockFacet.deploy();
    await upgradeMockFacet.deployed();
    upgradeMockFacetSelectors = Object.keys(
      upgradeMockFacet.interface.functions
    ).map((fn) => upgradeMockFacet.interface.getSighash(fn));
  });

  describe("Add facet", function () {
    it("Failed to add facet, invalid signer (not admin)", async function () {
      const mockFacet = {
        target: upgradeMockFacet.address,
        action: 0, // add
        selectors: upgradeMockFacetSelectors,
      };
      await expect(
        zkTrueUp
          .connect(user1)
          .diamondCut([mockFacet], ethers.constants.AddressZero, "0x")
      ).to.be.revertedWithCustomError(zkTrueUp, "Ownable__NotOwner");
    });
    it("Failed to add facet, invalid function selector (0 selector)", async function () {
      const mockFacet = {
        target: upgradeMockFacet.address,
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
      const upgradeFacet = {
        target: upgradeMockFacet.address,
        action: 0, // add
        selectors: upgradeMockFacetSelectors,
      };
      await zkTrueUp
        .connect(admin)
        .diamondCut([upgradeFacet], ethers.constants.AddressZero, "0x");

      // check that new facet function selectors are registered
      expect(
        await zkTrueUp.facetFunctionSelectors(upgradeMockFacet.address)
      ).have.members(upgradeMockFacetSelectors);
      // check that new function selectors are registered to new facet address
      for (let i = 0; i < upgradeMockFacetSelectors.length; i++) {
        expect(
          await zkTrueUp.facetAddress(upgradeMockFacetSelectors[i])
        ).to.equal(upgradeMockFacet.address);
      }

      // call new facet function
      const diamondUpgradeMockFacet = (await useFacet(
        "UpgradeMockFacet",
        zkTrueUp.address
      )) as UpgradeMockFacet;

      // check the new facet function is called successfully
      await diamondUpgradeMockFacet.connect(admin).setValue(1);
      await diamondUpgradeMockFacet.connect(admin).setAddress(user1Addr);
      expect(await diamondUpgradeMockFacet.getValue()).to.equal(1);
      expect(await diamondUpgradeMockFacet.getAddress()).to.equal(user1Addr);
    });
  });
});

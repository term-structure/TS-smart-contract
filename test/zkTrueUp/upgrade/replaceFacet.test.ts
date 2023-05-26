import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BaseContract, Signer } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import {
  AccountFacet,
  AccountFacet__factory,
  TokenFacet,
  ZkTrueUp,
} from "../../../typechain-types";
import { replaceFacet } from "../../../utils/diamondActions/replaceFacet";

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
  let [invalidSigner]: Signer[] = [];
  let admin: Signer;
  let deployer: Signer;
  let zkTrueUp: ZkTrueUp;
  let facets: { [key: string]: BaseContract } = {};
  let fnSelectors: { [key: string]: string[] } = {};
  let NewAccountFacet: AccountFacet__factory;
  let newAccountFacet: AccountFacet;
  let newAccountFacetFnSelectors: string[];

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [invalidSigner] = await ethers.getSigners();
    admin = res.admin;
    deployer = res.deployer;
    zkTrueUp = res.zkTrueUp;
    facets = res.facets;
    fnSelectors = res.fnSelectors;
    // deploy new AccountFacet
    NewAccountFacet = await ethers.getContractFactory("AccountFacet");
    newAccountFacet = await NewAccountFacet.connect(deployer).deploy();
    await newAccountFacet.deployed();
    newAccountFacetFnSelectors = Object.keys(
      newAccountFacet.interface.functions
    ).map((fn) => newAccountFacet.interface.getSighash(fn));
  });

  describe("Replace facet", function () {
    it("Failed to replace facet, invalid selector (selector not found)", async function () {
      const invalidFnSelector = "0x12345678";
      const mockFacet = {
        target: newAccountFacet.address,
        action: 1, // replace
        selectors: [invalidFnSelector],
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
      const invalidFnSelector = "0x12345678";
      const mockFacet = {
        target: await invalidSigner.getAddress(),
        action: 1, // replace
        selectors: [invalidFnSelector],
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
      await replaceFacet(
        admin,
        zkTrueUp,
        newAccountFacet.address,
        NewAccountFacet
      );

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
        zkTrueUp.address
      )) as AccountFacet;
      const accountNum = await diamondAcc.getAccountNum();
      expect(accountNum).to.equal(1);
    });
  });
});

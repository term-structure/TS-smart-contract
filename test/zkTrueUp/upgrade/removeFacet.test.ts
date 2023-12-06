import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BaseContract, Signer } from "ethers";
import { safeRemoveFacet } from "diamond-engraver";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import { TokenFacet, ZkTrueUp } from "../../../typechain-types";

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
  let admin: Signer;
  let zkTrueUp: ZkTrueUp;
  let facets: { [key: string]: BaseContract } = {};
  let fnSelectors: { [key: string]: string[] } = {};

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    admin = res.admin;
    zkTrueUp = res.zkTrueUp;
    facets = res.facets;
    fnSelectors = res.fnSelectors;
  });

  describe("Remove facet", function () {
    it("Failed to remove facet, invalid facet target (target address should be 0 when remove)", async function () {
      const invalidFnSelector = "0x12345678";
      const mockFacet = {
        target: facets["AccountFacet"].address,
        action: 2, // remove
        selectors: [invalidFnSelector],
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
      const AccountFactory = await ethers.getContractFactory("AccountFacet");
      const provider = ethers.provider;
      await safeRemoveFacet(admin, provider, zkTrueUp, AccountFactory);

      // check that removed facet function selectors are removed
      expect(
        await zkTrueUp.facetFunctionSelectors(facets["AccountFacet"].address)
      ).to.be.empty;
      // check that removed function selectors are removed
      const accountFnSelectors = fnSelectors["AccountFacet"];
      for (let i = 0; i < accountFnSelectors.length; i++) {
        expect(await zkTrueUp.facetAddress(accountFnSelectors[i])).to.equal(
          ethers.constants.AddressZero
        );
      }
    });
  });
});

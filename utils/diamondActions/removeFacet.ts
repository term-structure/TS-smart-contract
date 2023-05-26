import { ethers } from "hardhat";
import { BaseContract, ContractFactory, Signer } from "ethers";
import { getExistingFacets, getFnSelectors } from "../diamondHelper";
import { DIAMOND_CUT_ACTION } from "../config";

export const removeFacet = async (
  signer: Signer,
  diamond: BaseContract,
  targetFactory: ContractFactory
) => {
  const targetSelectors = await getFnSelectors(targetFactory);
  if (targetSelectors.length === 0) {
    throw new Error("No selectors found for target contract");
  }

  // check remove facet is registered
  const existingFacets = await getExistingFacets(diamond.address);
  for (const targetSelector of targetSelectors) {
    let found = false;
    for (const existingFacet of existingFacets) {
      if (existingFacet.selectors.includes(targetSelector)) {
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(
        `Cannot remove facet: ${targetSelector} is not registered`
      );
    }
  }

  // check cannot remove immutable facets
  const diamondFnSelectors = await getFnSelectors(diamond);
  for (const selector of targetSelectors) {
    if (diamondFnSelectors.includes(selector)) {
      throw new Error(
        `Cannot remove immutable facet: ${selector} is already registered`
      );
    }
  }

  const facets = [
    {
      target: ethers.constants.AddressZero,
      action: DIAMOND_CUT_ACTION.REMOVE,
      selectors: targetSelectors,
    },
  ];

  const tx = await diamond
    .connect(signer)
    .diamondCut(facets, ethers.constants.AddressZero, "0x");

  await tx.wait();
  return targetSelectors;
};

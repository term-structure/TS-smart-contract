import { ethers } from "hardhat";
import { BaseContract, ContractFactory, Signer } from "ethers";
import {
  getExistingFacets,
  getFnSelectors,
  safeFnSelectors,
} from "./diamondHelper";
import { DIAMOND_CUT_ACTION } from "./config";

export const facetAdd = async (
  signer: Signer,
  diamond: BaseContract,
  targetAddr: string,
  targetFactory: ContractFactory
) => {
  const existingFacets = await getExistingFacets(diamond.address);
  const targetSelectors = await getFnSelectors(targetFactory);
  for (const existingFacet of existingFacets) {
    safeFnSelectors(targetSelectors, existingFacet);
  }
  const facets = [
    {
      target: targetAddr,
      action: DIAMOND_CUT_ACTION.ADD,
      selectors: targetSelectors,
    },
  ];
  const tx = await diamond
    .connect(signer)
    .diamondCut(facets, ethers.constants.AddressZero, "0x");

  await tx.wait();
  return targetSelectors;
};

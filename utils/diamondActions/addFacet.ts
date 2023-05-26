import { ethers } from "hardhat";
import { BaseContract, ContractFactory, Signer } from "ethers";
import {
  getExistingFacets,
  getFnSelectors,
  safeFnSelectors,
} from "../diamondHelper";
import { DIAMOND_CUT_ACTION } from "../config";

export const addFacet = async (
  signer: Signer,
  diamond: BaseContract,
  targetAddr: string,
  targetFactory: ContractFactory
) => {
  const bytecode = await ethers.provider.getCode(targetAddr);
  if (bytecode === "0x") {
    throw new Error("Target address is not a contract");
  }
  const targetSelectors = await getFnSelectors(targetFactory);
  if (targetSelectors.length === 0) {
    throw new Error("No selectors found for target contract");
  }
  const existingFacets = await getExistingFacets(diamond.address);
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

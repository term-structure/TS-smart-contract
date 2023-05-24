import { ethers } from "hardhat";
import diamondReadableABI from "@solidstate/abi/DiamondReadable.json";
import { DiamondReadable, IDiamondReadable } from "../typechain-types";
import { ContractFactory } from "ethers";

export const getExistingFacets = async (diamondAddr: string) => {
  const diamondReadable = (await ethers.getContractAt(
    diamondReadableABI,
    diamondAddr
  )) as DiamondReadable;
  let existingFacets;
  try {
    existingFacets = await diamondReadable.facets();
  } catch (e: any) {
    throw new Error(`Error getting facets from diamond contract: ${e.message}`);
  }
  return existingFacets;
};

export const safeFnSelectors = (
  targetSelectors: string[],
  existingFacet: IDiamondReadable.FacetStructOutput
) => {
  // check no function selectors collision
  const selectors = existingFacet.selectors;
  for (const selector of selectors) {
    if (targetSelectors.includes(selector)) {
      throw new Error(
        `Function selector collision: ${selector} is already registered`
      );
    }
  }
};

export const getFnSelectors = async (contractFactory: ContractFactory) => {
  const fnSelectors = Object.keys(contractFactory.interface.functions).map(
    (fn) => {
      const sl = contractFactory.interface.getSighash(fn);
      return sl;
    }
  );
  return fnSelectors;
};

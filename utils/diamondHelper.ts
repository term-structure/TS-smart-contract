import { ethers } from "hardhat";
import diamondReadableABI from "@solidstate/abi/DiamondReadable.json";
import { DiamondReadable, IDiamondReadable } from "../typechain-types";
import { Contract, ContractFactory } from "ethers";

export const getExistingFacetAddresses = async (diamondAddr: string) => {
  const diamondReadable = (await ethers.getContractAt(
    diamondReadableABI,
    diamondAddr
  )) as DiamondReadable;
  let existingFacetAddresses;
  try {
    existingFacetAddresses = await diamondReadable.facetAddresses();
  } catch (e: any) {
    throw new Error(
      `Error getting facet addresses from diamond contract: ${e.message}`
    );
  }
  return existingFacetAddresses;
};

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

export const getFnSelectors = async (
  contractOrContractFactory: Contract | ContractFactory
) => {
  try {
    const fnSelectors = Object.keys(
      contractOrContractFactory.interface.functions
    ).map((fn) => {
      const sl = contractOrContractFactory.interface.getSighash(fn);
      return sl;
    });
    return fnSelectors;
  } catch (e: any) {
    throw new Error(`Error getting function selectors: ${e.message}`);
  }
};

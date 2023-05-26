import { ethers } from "hardhat";

export const useFacet = async (facetName: string, diamondAddr: string) => {
  const facet = await ethers.getContractAt(facetName, diamondAddr);
  return facet;
};

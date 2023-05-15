import { ethers } from "hardhat";
import { ZkTrueUp } from "../typechain-types";

export const useFacet = async (facetName: string, diamond: ZkTrueUp) => {
  const facet = await ethers.getContractAt(facetName, diamond.address);
  return facet;
};

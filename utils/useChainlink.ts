import { ethers } from "hardhat";

export const useChainlink = async (contractAddr: string) => {
  const chainlinkAggregator = await ethers.getContractAt(
    "AggregatorV3Interface",
    contractAddr
  );
  return chainlinkAggregator;
};

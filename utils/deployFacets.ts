import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BaseContract, ContractFactory } from "ethers";
import { ethers } from "hardhat";

export const deployFacets = async (
  facetNames: string[],
  deployer: SignerWithAddress
): Promise<{
  facetFactories: { [key: string]: ContractFactory };
  facets: { [key: string]: BaseContract };
}> => {
  const facetFactories: { [key: string]: ContractFactory } = {};
  const deployedFacets: { [key: string]: BaseContract } = {};
  for (const facet of facetNames) {
    const facetFactory = await ethers.getContractFactory(facet);
    const deployedFacet = await facetFactory.connect(deployer).deploy();
    await deployedFacet.deployed();
    facetFactories[facet] = facetFactory;
    deployedFacets[facet] = deployedFacet;
  }
  return { facetFactories, facets: deployedFacets };
};

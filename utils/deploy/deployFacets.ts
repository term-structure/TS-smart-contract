import { BaseContract, ContractFactory, Signer } from "ethers";
import { ethers } from "hardhat";

export const deployFacets = async (
  facetNames: string[],
  deployer: Signer,
  currentDeployerNonce?: number
): Promise<{
  facetFactories: { [key: string]: ContractFactory };
  facets: { [key: string]: BaseContract };
  newDeployerNonce?: number;
}> => {
  const facetFactories: { [key: string]: ContractFactory } = {};
  const deployedFacets: { [key: string]: BaseContract } = {};
  for (const facet of facetNames) {
    const facetFactory = await ethers.getContractFactory(facet);
    const feeData = deployer.provider
      ? await deployer.provider.getFeeData()
      : null;
    const deployedFacet = await facetFactory.connect(deployer).deploy({
      nonce: currentDeployerNonce ? currentDeployerNonce++ : undefined,
      maxFeePerGas: feeData?.maxFeePerGas?.add(
        ethers.utils.parseUnits("20", "gwei")
      ),
      maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas?.add(
        ethers.utils.parseUnits("3", "gwei")
      ),
    });
    console.log(
      `Deployed ${facet}... (tx: ${deployedFacet.deployTransaction.hash})`
    );
    await deployedFacet.deployed();
    facetFactories[facet] = facetFactory;
    deployedFacets[facet] = deployedFacet;
  }
  return {
    facetFactories,
    facets: deployedFacets,
    newDeployerNonce: currentDeployerNonce,
  };
};

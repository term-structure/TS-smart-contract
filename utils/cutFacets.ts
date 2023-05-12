import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ZkTrueUp } from "../typechain-types";
import { FacetInfo, FnSelectors } from "./type";
import { diamondCut } from "./diamondCut";

export const cutFacets = async (
  deployer: SignerWithAddress,
  diamond: ZkTrueUp,
  facets: FacetInfo[]
): Promise<{ [key: string]: FnSelectors }> => {
  const selectors: { [key: string]: FnSelectors } = {};
  for (const { facetName, facetAddress, facetFactory } of facets) {
    const facetSelectors = await diamondCut(
      deployer,
      diamond,
      facetAddress,
      facetFactory
    );
    selectors[facetName] = facetSelectors;
  }
  return selectors;
};

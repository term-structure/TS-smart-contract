import { ZkTrueUp } from "../typechain-types";
import { FacetInfo, FnSelectors } from "./type";
import { facetAdd } from "./facetAdd";
import { Signer } from "ethers";

export const cutFacets = async (
  deployer: Signer,
  diamond: ZkTrueUp,
  facets: FacetInfo[]
): Promise<{ [key: string]: FnSelectors }> => {
  const selectors: { [key: string]: FnSelectors } = {};
  for (const { facetName, facetAddress, facetFactory } of facets) {
    const facetSelectors = await facetAdd(
      deployer,
      diamond,
      facetAddress,
      facetFactory
    );
    selectors[facetName] = facetSelectors;
  }
  return selectors;
};

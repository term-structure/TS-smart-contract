import { safeAddFacet } from "diamond-engraver";
import { ZkTrueUp } from "../typechain-types";
import { FacetInfo, FnSelectors } from "./type";
import { Signer, providers } from "ethers";

export const cutFacets = async (
  deployer: Signer,
  provider: providers.Provider,
  diamond: ZkTrueUp,
  facets: FacetInfo[]
): Promise<{ [key: string]: FnSelectors }> => {
  const selectors: { [key: string]: FnSelectors } = {};
  for (const { facetName, facetAddress, facetFactory } of facets) {
    const facetSelectors = await safeAddFacet(
      deployer,
      provider,
      diamond,
      facetAddress,
      facetFactory
    );
    // console.log(`Added ${facetName} to zkTrueUp`);
    selectors[facetName] = facetSelectors;
  }
  return selectors;
};

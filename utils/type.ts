import { ContractFactory } from "ethers";

// { TsTokenId: BaseTokenAddr }
export type BaseTokenAddresses = { [key: number]: string };

// { TsTokenId: PriceFeed }
export type PriceFeeds = { [key: number]: string };

export type FacetInfo = {
  facetName: string;
  facetAddress: string;
  facetFactory: ContractFactory;
};

export type FnSelectors = string[];

import { ContractFactory } from "ethers";

// { TsTokenId: BaseTokenAddr }
export type BaseTokenAddr = { [key: number]: string };

// { TsTokenId: PriceFeed }
export type PriceFeed = { [key: number]: string };

export type FacetInfo = {
  facetName: string;
  facetAddress: string;
  facetFactory: ContractFactory;
};

export type FnSelectors = string[];

import { BigNumber, ContractFactory } from "ethers";

// { TsTokenId: BaseTokenAddr }
export type BaseTokenAddresses = { [key: number]: string };

// { TsTokenId: PriceFeed }
export type PriceFeeds = { [key: number]: string };

export type TsbTokenData = {
  name: string;
  symbol: string;
  underlyingAsset: string;
  underlyingTokenId: number;
  maturity: string;
  isStableCoin: boolean;
  minDepositAmt: string;
};

export type RoundData = {
  roundId: number;
  answer: string;
  startedAt: number;
  updatedAt: number;
  answeredInRound: number;
};

export type LoanData = {
  accountId: number;
  tsbTokenId: number;
  collateralTokenId: number;
  collateralAmt: BigNumber;
  debtAmt: BigNumber;
};

export type FacetInfo = {
  facetName: string;
  facetAddress: string;
  facetFactory: ContractFactory;
};

export type FnSelectors = string[];

export type LoanPubData = {
  accountId: BigNumber;
  collateralTokenId: BigNumber;
  bondTokenId: BigNumber;
  debtAmt: BigNumber;
  collateralAmt: BigNumber;
};

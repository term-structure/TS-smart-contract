import { BigNumber, ContractFactory } from "ethers";
import { LoanStruct } from "../typechain-types/contracts/loan/ILoanFacet";

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

export class AccountState {
  pendingBalances: { [key: number]: BigNumber };
  loans: { [key: string]: LoanStruct };
  withdrawFees: { [key: number]: BigNumber };
  constructor() {
    this.pendingBalances = {};
    this.loans = {};
    this.withdrawFees = {};
  }
}

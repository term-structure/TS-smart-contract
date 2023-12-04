import { BigNumber, ContractFactory } from "ethers";
import { LoanStruct } from "../typechain-types/contracts/zkTrueUp/loan/LoanFacet";

// { TsTokenId: BaseTokenAddr }
export type BaseTokenAddresses = { [key: string]: string };

// { TsTokenId: PriceFeed }
export type PriceFeeds = { [key: string]: string };

// 0 = add, 1 = replace, 2 = remove
export type DiamondCutAction = 0 | 1 | 2;

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

export function getBoolean(str: string | undefined, defaultVal?: boolean) {
  try {
    if (str === "" || typeof str === "undefined")
      throw new Error(`'${str}' is not a boolean`);
    return !!JSON.parse(str.toLowerCase());
  } catch (error) {
    if (typeof defaultVal !== "undefined") {
      return defaultVal;
    }
    throw new Error(`'${str}' is not a boolean`);
  }
}

export function getNumber(str: string | undefined) {
  if (str === "" || typeof str === "undefined")
    throw new Error(`'${str}' is not a number`);
  const num = JSON.parse(str);
  if (typeof num === "number") {
    return num;
  }
  throw new Error(`'${str}' is not a number`);
}

export function getString(str: string | undefined) {
  try {
    if (str === "" || typeof str === "undefined")
      throw new Error(`'${str}' is not a string`);
    return str;
  } catch (error) {
    throw new Error(`'${str}' is not a string`);
  }
}

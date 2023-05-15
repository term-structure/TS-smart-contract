import { BigNumber } from "ethers";
import { TS_DECIMALS, TsTokenType } from "term-structure-sdk";
import { MAX_LTV_RATIO } from "../../utils/config";

export const toL2Amt = (
  l1Amt: BigNumber,
  tokenType: TsTokenType
): BigNumber => {
  return BigNumber.from(l1Amt)
    .mul(BigNumber.from(10).pow(TS_DECIMALS.AMOUNT))
    .div(BigNumber.from(10).pow(tokenType.decimals));
};

export const toL1Amt = (
  l2Amt: BigNumber,
  tokenType: TsTokenType
): BigNumber => {
  return BigNumber.from(l2Amt)
    .mul(BigNumber.from(10).pow(tokenType.decimals))
    .div(BigNumber.from(10).pow(TS_DECIMALS.AMOUNT));
};

export const getLiquidatorRewardAmt = (
  debtValue: BigNumber,
  collateralToken: TsTokenType,
  debtToken: TsTokenType,
  liquidationFactor: any,
  collateralPrice: BigNumber
): BigNumber => {
  return BigNumber.from(debtValue)
    .mul(BigNumber.from(10).pow(collateralToken.decimals))
    .mul(MAX_LTV_RATIO + liquidationFactor.liquidatorIncentive)
    .div(MAX_LTV_RATIO)
    .div(BigNumber.from(10).pow(debtToken.decimals))
    .div(collateralPrice);
};

export const getProtocolPenaltyAmt = (
  debtValue: BigNumber,
  collateralToken: TsTokenType,
  debtToken: TsTokenType,
  liquidationFactor: any,
  collateralPrice: BigNumber
): BigNumber => {
  return BigNumber.from(debtValue)
    .mul(BigNumber.from(10).pow(collateralToken.decimals))
    .mul(liquidationFactor.protocolPenalty)
    .div(MAX_LTV_RATIO)
    .div(BigNumber.from(10).pow(debtToken.decimals))
    .div(collateralPrice);
};

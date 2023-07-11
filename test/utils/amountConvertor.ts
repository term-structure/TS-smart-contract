import { BigNumber } from "ethers";
import { TS_DECIMALS, TsTokenType } from "term-structure-sdk";
import { MAX_LTV_RATIO } from "../../utils/config";
import { LiquidationFactorStruct } from "../../typechain-types/contracts/zkTrueUp/loan/LoanFacet";

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

export const calcRepayValueEquivCollateralAmt = (
  repayAmt: BigNumber,
  collateralToken: TsTokenType,
  collateralPrice: BigNumber,
  debtToken: TsTokenType,
  debtPrice: BigNumber
): BigNumber => {
  // normalized means 18 decimals in price which is received from chainlink
  const normalizedRepayValue = debtPrice
    .mul(repayAmt)
    .div(BigNumber.from(10).pow(debtToken.decimals));
  const repayValueEquivCollateralAmt = normalizedRepayValue
    .mul(BigNumber.from(10).pow(collateralToken.decimals))
    .div(collateralPrice);
  return repayValueEquivCollateralAmt;
};

export const calcLiquidatorRewardAmt = (
  repayValueEquivCollateralAmt: BigNumber,
  liquidationFactor: LiquidationFactorStruct
): BigNumber => {
  return repayValueEquivCollateralAmt
    .mul(
      BigNumber.from(MAX_LTV_RATIO).add(
        BigNumber.from(liquidationFactor.liquidatorIncentive)
      )
    )
    .div(BigNumber.from(MAX_LTV_RATIO));
};

export const calcProtocolPenaltyAmt = (
  repayValueEquivCollateralAmt: BigNumber,
  liquidationFactor: any
): BigNumber => {
  return repayValueEquivCollateralAmt
    .mul(liquidationFactor.protocolPenalty)
    .div(BigNumber.from(MAX_LTV_RATIO));
};

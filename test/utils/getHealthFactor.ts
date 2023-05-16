import { BigNumber, ethers } from "ethers";
import { TS_DECIMALS } from "term-structure-sdk";
import { LoanData, TsbTokenData } from "../../utils/type";
import { TokenFacet } from "../../typechain-types";

export const getExpectedHealthFactor = async (
  diamondToken: TokenFacet,
  tsbTokenData: TsbTokenData,
  loanData: LoanData,
  collateralAnswer: BigNumber,
  debtAnswer: BigNumber,
  LTV_THRESHOLD: number
) => {
  // calculate expected health factor
  const collateralPrice = collateralAnswer;
  const debtPrice = debtAnswer;

  // collateral l1 decimals
  const collateralDecimal = await (
    await diamondToken.getAssetConfig(loanData.collateralTokenId)
  ).decimals;

  // debt l1 decimals
  const debtTokenId = tsbTokenData.underlyingTokenId;
  const debtDecimal = await (
    await diamondToken.getAssetConfig(debtTokenId)
  ).decimals;

  // collateral amount with l1 decimals
  const collateralAmt = BigNumber.from(loanData.collateralAmt)
    .mul(BigNumber.from(10).pow(collateralDecimal))
    .div(BigNumber.from(10).pow(TS_DECIMALS.AMOUNT));

  // debt amount with l1 decimals
  const debtAmt = BigNumber.from(loanData.debtAmt)
    .mul(BigNumber.from(10).pow(debtDecimal))
    .div(BigNumber.from(10).pow(TS_DECIMALS.AMOUNT));

  // collateral value = collateral price * collateral amount
  const collateralValue = BigNumber.from(collateralPrice).mul(collateralAmt);

  // debt value = debt price * debt amount
  const debtValue = BigNumber.from(debtPrice).mul(debtAmt);

  // expected health factor = ltvThreshold * (collateralValue / 10 ** collateralDecimal) / (debtValue * 10 ** debtDecimal)
  const expectedHealthFactor = debtAmt.isZero()
    ? ethers.constants.MaxUint256
    : BigNumber.from(LTV_THRESHOLD)
        .mul(collateralValue)
        .mul(BigNumber.from(10).pow(debtDecimal))
        .div(debtValue)
        .div(BigNumber.from(10).pow(collateralDecimal));

  return expectedHealthFactor;
};

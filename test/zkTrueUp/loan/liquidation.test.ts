import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { register } from "../../utils/register";
import { BaseTokenAddresses, LoanData, PriceFeeds } from "../../../utils/type";
import { maturedTsbTokensJSON, tsbTokensJSON } from "../../data/tsbTokens";
import { loanDataJSON, stableCoinPairLoanDataJSON } from "../../data/loanData";
import { updateRoundData } from "../../utils/updateRoundData";
import { liquidationRoundDataJSON } from "../../data/roundData";
import { getExpectedHealthFactor } from "../../utils/getHealthFactor";
import {
  calcLiquidatorRewardAmt,
  calcProtocolPenaltyAmt,
  toL1Amt,
  toL2Amt,
} from "../../utils/amountConvertor";
import {
  createAndWhiteListTsbToken,
  whiteListBaseTokens,
} from "../../utils/whitelistToken";
import {
  AccountFacet,
  ERC20Mock,
  LoanFacet,
  RollupMock,
  TokenFacet,
  TsbMock,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  LIQUIDATION_FACTOR,
  STABLECOIN_PAIR_LIQUIDATION_FACTOR,
  TS_BASE_TOKEN,
  TsTokenId,
} from "term-structure-sdk";

const enum Case {
  "case0" = 0,
  "case1" = 1,
  "case2" = 2,
  "case3" = 3,
  "case4" = 4,
  "case5" = 5,
  "case6" = 6,
  "case7" = 7,
  "case8" = 8,
  "case9" = 9,
}

const enum TokenType {
  "collateral" = 0,
  "debt" = 1,
}

//! use RollupMock and TsbMock for testing
export const FACET_NAMES_MOCK = [
  "AccountFacet",
  "AddressFacet",
  "FlashLoanFacet",
  "ProtocolParamsFacet",
  "LoanFacet",
  "RollupMock", // replace RollupFacet with RollupMock
  "TokenFacet",
  "TsbMock", // replace TsbFacet with TsbMock
];

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES_MOCK);
  const diamondToken = (await useFacet(
    "TokenFacet",
    res.zkTrueUp.address
  )) as TokenFacet;
  await whiteListBaseTokens(
    res.baseTokenAddresses,
    res.priceFeeds,
    diamondToken,
    res.operator
  );
  return res;
};

describe("Liquidation", () => {
  let [user1, liquidator]: Signer[] = [];
  let [liquidatorAddr]: string[] = [];
  let admin: Signer;
  let operator: Signer;
  let treasuryAddr: string;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondLoan: LoanFacet;
  let diamondRollupMock: RollupMock;
  let diamondToken: TokenFacet;
  let diamondTsbMock: TsbMock;
  let baseTokenAddresses: BaseTokenAddresses;
  let priceFeeds: PriceFeeds;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1, liquidator] = await ethers.getSigners();
    [liquidatorAddr] = await Promise.all([liquidator.getAddress()]);
    admin = res.admin;
    operator = res.operator;
    treasuryAddr = res.treasury.address;
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUpAddr)) as LoanFacet;
    diamondRollupMock = (await useFacet(
      "RollupMock",
      zkTrueUpAddr
    )) as RollupMock;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsbMock = (await useFacet("TsbMock", zkTrueUpAddr)) as TsbMock;
    baseTokenAddresses = res.baseTokenAddresses;
    priceFeeds = res.priceFeeds;
  });

  describe("Full liquidation, (general case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = LIQUIDATION_FACTOR;
    const tsbTokenData = tsbTokensJSON[3]; // tsb USDC
    const loanData = loanDataJSON[3]; // ETH -> USDC

    // collateral = 1 eth, debt = 500 usdc
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let ethAnswer: BigNumber;
    let usdcAnswer: BigNumber;
    let usdc: ERC20Mock;

    beforeEach(async () => {
      // tsb USDC
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsbMock,
        operator,
        tsbTokenData
      );

      // ETH decimals = 18
      const decimals = 18;
      // register by ETH
      const registerAmt = utils.parseUnits("10", decimals);
      // register user1
      await register(
        user1,
        Number(TsTokenId.ETH),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // mint default usdc to liquidator
      usdc = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDC]
      )) as ERC20Mock;
      await usdc
        .connect(liquidator)
        .mint(
          liquidatorAddr,
          utils.parseUnits("10000", TS_BASE_TOKEN.USDC.decimals)
        );

      // approve usdc to zkTrueUp
      await usdc
        .connect(liquidator)
        .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    });
    it("Fail to liquidation, loan is healthy", async () => {
      // set the price for liquidation
      // eth = 1000 usd, usdc = 1 usd
      // healthFactor > 1
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case0][TokenType.collateral];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case0][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      const repayAmt = utils.parseUnits("100", TS_BASE_TOKEN.USDC.decimals);
      const [isLiquidable, ,] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      expect(isLiquidable).to.be.false;
      await expect(
        diamondLoan.connect(liquidator).liquidate(loanId, repayAmt)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsSafe");
    });
    it("Success to liquidate (repay 10% debt value), health factor < 1 (general loan, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // eth = 620 usd, usdc = 1 usd
      // healthFactor = 0.992 < 1
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case1][TokenType.collateral];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case1][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const [isLiquidable, , maxRepayAmt] = await diamondLoan.isLiquidable(
        loanId
      );
      // repay 10% debt value
      const repayAmt = maxRepayAmt.div(10);
      // liquidate
      expect(isLiquidable).to.be.true;
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const repayValue = repayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWethBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        repayAmt
      );
      expect(
        beforeLiquidatorEthBalance.add(liquidatorReward).sub(liquidateGas)
      ).to.eq(afterLiquidatorEthBalance);
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryEthBalance.add(protocolPenalty)).to.eq(
        afterTreasuryEthBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.ETH
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.ETH
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor equal to expected health factor
      console.log("newHealthFactor", newHealthFactor.toString());
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay 80% debt value), health factor < 1 (general loan, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // eth = 620 usd, usdc = 1 usd
      // healthFactor = 0.992 < 1
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case1][TokenType.collateral];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case1][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const [isLiquidable, , maxRepayAmt] = await diamondLoan.isLiquidable(
        loanId
      );
      // repay 80% debt value
      const repayAmt = maxRepayAmt.div(10).mul(8);
      // liquidate
      expect(isLiquidable).to.be.true;
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const repayValue = repayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWethBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        repayAmt
      );
      expect(
        beforeLiquidatorEthBalance.add(liquidatorReward).sub(liquidateGas)
      ).to.eq(afterLiquidatorEthBalance);
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryEthBalance.add(protocolPenalty)).to.eq(
        afterTreasuryEthBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.ETH
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.ETH
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor equal to expected health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay all debt value), health factor < 1 (general loan, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // eth = 620 usd, usdc = 1 usd
      // healthFactor = 0.992 < 1
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case1][TokenType.collateral];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case1][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const [isLiquidable, , maxRepayAmt] = await diamondLoan.isLiquidable(
        loanId
      );
      // liquidate
      expect(isLiquidable).to.be.true;
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, maxRepayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const repayValue = maxRepayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWethBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        maxRepayAmt
      );
      expect(
        beforeLiquidatorEthBalance.add(liquidatorReward).sub(liquidateGas)
      ).to.eq(afterLiquidatorEthBalance);
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeTreasuryEthBalance.add(protocolPenalty)).to.eq(
        afterTreasuryEthBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.ETH
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.ETH
      );

      const repayAmtConverted = toL2Amt(maxRepayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor > 1, and equal to expected health factor
      expect(newHealthFactor).gt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay all debt value), health factor < 1 (general loan, collateral can cover liquidator reward but cannot cover protocol penalty)", async () => {
      // set the price for liquidation
      // eth = 545 usd, usdc = 1 usd
      // healthFactor = 0.872 < 1
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case2][TokenType.collateral];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case2][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, maxRepayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const debtValue = maxRepayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      // protocol penalty with collateral token L1 decimals
      // protocol penalty = collateralAmt - liquidator reward
      const protocolPenalty = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      ).sub(liquidatorReward);
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWethBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        maxRepayAmt
      );
      expect(
        beforeLiquidatorEthBalance.add(liquidatorReward).sub(liquidateGas)
      ).to.eq(afterLiquidatorEthBalance);
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeTreasuryEthBalance.add(protocolPenalty)).to.eq(
        afterTreasuryEthBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.ETH
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.ETH
      );

      const repayAmtConverted = toL2Amt(maxRepayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor > 1, and equal to expected health factor
      expect(newHealthFactor).gt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay all debt value), health factor < 1 (general loan, collateral cannot cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // eth = 510 usd, usdc = 1 usd
      // healthFactor = 0.816 < 1
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case3][TokenType.collateral];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case3][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);

      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, maxRepayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      // liquidator reward with collateral token decimals
      // collateral cannot cover liquidator reward and protocol penalty
      // liquidator reward = total collateral amount
      // protocol penalty = 0
      const liquidatorReward = toL1Amt(
        BigNumber.from(loan.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      const protocolPenalty = BigNumber.from(0);
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWethBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        maxRepayAmt
      );
      expect(
        beforeLiquidatorEthBalance.add(liquidatorReward).sub(liquidateGas)
      ).to.eq(afterLiquidatorEthBalance);
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeTreasuryEthBalance).to.eq(afterTreasuryEthBalance);

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.ETH
      );

      const repayAmtConverted = toL2Amt(maxRepayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          liquidatorRewardAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor > 1, and equal to expected health factor
      expect(newHealthFactor).gt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
  });
  describe("Full liquidation (stable coin pair case)", () => {
    const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = STABLECOIN_PAIR_LIQUIDATION_FACTOR;
    const tsbTokenData = tsbTokensJSON[4]; // tsb DAI
    const loanData = stableCoinPairLoanDataJSON[1]; // USDT -> DAI

    // collateral = 100 usdt, debt = 90 dai
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let usdtAnswer: BigNumber;
    let daiAnswer: BigNumber;
    let usdt: ERC20Mock;
    let dai: ERC20Mock;

    beforeEach(async () => {
      // tsb dai
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsbMock,
        operator,
        tsbTokenData
      );

      // register by usdt
      const registerAmt = utils.parseUnits(
        "10000",
        TS_BASE_TOKEN.USDT.decimals
      );
      // register user1
      await register(
        user1,
        Number(TsTokenId.USDT),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // set usdt contract
      usdt = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      )) as ERC20Mock;

      // mint default usdc to liquidator
      dai = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.DAI]
      )) as ERC20Mock;
      await dai
        .connect(liquidator)
        .mint(
          liquidatorAddr,
          utils.parseUnits("10000", TS_BASE_TOKEN.DAI.decimals)
        );

      // approve usdc to zkTrueUp
      await dai
        .connect(liquidator)
        .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    });
    it("Success to liquidate (repay 50% debt value), health factor < 1 (stable coin pairs loan, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // usdt = 0.97 usd, dai = 1 usd
      // healthFactor = 0.9969 < 1
      // set usdt price
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON =
        liquidationRoundDataJSON[Case.case4][TokenType.collateral];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON =
        liquidationRoundDataJSON[Case.case4][TokenType.debt];
      daiAnswer = await (
        await updateRoundData(operator, daiPriceFeed, daiRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const beforeLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);

      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // repay 50% debt value
      const repayAmt = maxRepayAmt.div(2);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const afterLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const debtValue = repayAmt.mul(daiAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpUsdtBalance
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.eq(
        repayAmt
      );
      expect(beforeLiquidatorUsdtBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorUsdtBalance
      );
      expect(beforeLiquidatorDaiBalance.sub(afterLiquidatorDaiBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryUsdtBalance.add(protocolPenalty)).to.eq(
        afterTreasuryUsdtBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.USDT
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.DAI);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        daiAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor equal to expected health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay all debt value), health factor < 1 (stable coin pairs loan, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // usdt = 0.97 usd, dai = 1 usd
      // healthFactor = 0.9969 < 1
      // set usdt price
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON =
        liquidationRoundDataJSON[Case.case4][TokenType.collateral];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON =
        liquidationRoundDataJSON[Case.case4][TokenType.debt];
      daiAnswer = await (
        await updateRoundData(operator, daiPriceFeed, daiRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const beforeLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);

      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, maxRepayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const afterLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const debtValue = maxRepayAmt.mul(daiAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpUsdtBalance
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeLiquidatorUsdtBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorUsdtBalance
      );
      expect(beforeLiquidatorDaiBalance.sub(afterLiquidatorDaiBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeTreasuryUsdtBalance.add(protocolPenalty)).to.eq(
        afterTreasuryUsdtBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.USDT
      );

      const repayAmtConverted = toL2Amt(maxRepayAmt, TS_BASE_TOKEN.DAI);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        daiAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor > 1, and equal to expected health factor
      expect(newHealthFactor).to.gt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay all debt value), health factor < 1 (stable coin pairs loan, collateral can cover liquidator reward but cannot cover protocol penalty)", async () => {
      // set the price for liquidation
      // usdt = 0.935 usd, dai = 1 usd
      // healthFactor = 0.96 < 1
      // set usdt price
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON =
        liquidationRoundDataJSON[Case.case5][TokenType.collateral];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON =
        liquidationRoundDataJSON[Case.case5][TokenType.debt];
      daiAnswer = await (
        await updateRoundData(operator, daiPriceFeed, daiRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const beforeLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);

      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, maxRepayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const afterLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const debtValue = maxRepayAmt.mul(daiAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      ).sub(liquidatorReward);
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpUsdtBalance
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeLiquidatorUsdtBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorUsdtBalance
      );
      expect(beforeLiquidatorDaiBalance.sub(afterLiquidatorDaiBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeTreasuryUsdtBalance.add(protocolPenalty)).to.eq(
        afterTreasuryUsdtBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.USDT
      );

      const repayAmtConverted = toL2Amt(maxRepayAmt, TS_BASE_TOKEN.DAI);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        daiAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor > 1, and equal to expected health factor
      expect(newHealthFactor).to.gt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay all debt value), health factor < 1 (stable coin pairs loan, collateral cannot cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // usdt = 0.5 usd, dai = 1 usd
      // healthFactor = 0.514 < 1
      // set usdt price
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON =
        liquidationRoundDataJSON[Case.case6][TokenType.collateral];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON =
        liquidationRoundDataJSON[Case.case6][TokenType.debt];

      daiAnswer = await (
        await updateRoundData(operator, daiPriceFeed, daiRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const beforeLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, maxRepayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const afterLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      // liquidator reward with collateral token decimals
      const liquidatorReward = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      );

      // protocol penalty with collateral token decimals
      const protocolPenalty = BigNumber.from(0);

      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpUsdtBalance
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeLiquidatorUsdtBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorUsdtBalance
      );
      expect(beforeLiquidatorDaiBalance.sub(afterLiquidatorDaiBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeTreasuryUsdtBalance).to.eq(afterTreasuryUsdtBalance);

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const repayAmtConverted = toL2Amt(maxRepayAmt, TS_BASE_TOKEN.DAI);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          liquidatorRewardAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        daiAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor > 1, and equal to expected health factor
      expect(newHealthFactor).to.gt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
  });
  describe("Partial liquidation (general case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = LIQUIDATION_FACTOR;
    const tsbTokenData = tsbTokensJSON[0]; // tsb ETH
    const loanData = loanDataJSON[4]; // WBTC -> ETH

    // collateral = 10 wbtc, debt = 100 eth
    // collateral > 10000 usd
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let wbtcAnswer: BigNumber;
    let ethAnswer: BigNumber;
    let wbtc: ERC20Mock;

    beforeEach(async () => {
      // tsb USDC
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsbMock,
        operator,
        tsbTokenData
      );

      // register by wbtc
      const registerAmt = utils.parseUnits("100", TS_BASE_TOKEN.WBTC.decimals);
      // register user1
      await register(
        user1,
        Number(TsTokenId.WBTC),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // get wbtc token
      wbtc = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.WBTC]
      )) as ERC20Mock;
    });
    it("Success to liquidate (repay 25% debt value), repay twice, health factor < 1 (general loan, half liquidation, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // wbtc = 12000 usd, eth = 1000 usd
      // healthFactor = 0.96 < 1
      // collateral value > 10000 usd -> partial liquidation
      // set wbtc price
      const wbtcPriceFeed = priceFeeds[TsTokenId.WBTC];
      const wbtcRoundDataJSON =
        liquidationRoundDataJSON[Case.case7][TokenType.collateral];
      wbtcAnswer = await (
        await updateRoundData(operator, wbtcPriceFeed, wbtcRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case7][TokenType.debt];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWbtcBalance = await wbtc.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeLiquidatorWbtcBalance = await wbtc.balanceOf(liquidatorAddr);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeTreasuryWbtcBalance = await wbtc.balanceOf(treasuryAddr);

      // half liquidation,  repayAmt = debtAmt / 2
      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // repay 25% debt value
      const repayAmt = maxRepayAmt.div(2);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt, { value: repayAmt });
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWbtcBalance = await wbtc.balanceOf(zkTrueUp.address);
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterLiquidatorWbtcBalance = await wbtc.balanceOf(liquidatorAddr);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterTreasuryWbtcBalance = await wbtc.balanceOf(treasuryAddr);

      // calculate expected amount
      const debtValue = repayAmt.mul(ethAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.WBTC,
        TS_BASE_TOKEN.ETH,
        liquidationFactor,
        wbtcAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.WBTC,
        TS_BASE_TOKEN.ETH,
        liquidationFactor,
        wbtcAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWbtcBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWbtcBalance
      );
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.eq(
        repayAmt
      );
      expect(beforeLiquidatorWbtcBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorWbtcBalance
      );
      expect(beforeLiquidatorEthBalance.sub(repayAmt).sub(liquidateGas)).to.eq(
        afterLiquidatorEthBalance
      );
      expect(beforeTreasuryWbtcBalance.add(protocolPenalty)).to.eq(
        afterTreasuryWbtcBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.WBTC
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.WBTC
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.ETH);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        wbtcAnswer,
        ethAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor equal to expected health factor and still less than 1
      expect(newHealthFactor).to.lt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);

      const [, , maxRepayAmt2] = await diamondLoan.isLiquidable(loanId);
      // liquidate again
      const repayAmt2 = maxRepayAmt2;
      const liquidateTx2 = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt2, { value: repayAmt2 });
      const liquidateReceipt2 = await liquidateTx2.wait();

      // gas fee
      const liquidateGas2 = BigNumber.from(liquidateReceipt2.gasUsed).mul(
        liquidateReceipt2.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWbtcBalance2 = await wbtc.balanceOf(zkTrueUp.address);
      const afterZkTrueUpWethBalance2 = await weth.balanceOf(zkTrueUp.address);
      const afterLiquidatorWbtcBalance2 = await wbtc.balanceOf(liquidatorAddr);
      const afterLiquidatorEthBalance2 = await liquidator.getBalance();

      // calculate expected amount
      const debtValue2 = repayAmt2.mul(ethAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward2 = calcLiquidatorRewardAmt(
        debtValue2,
        TS_BASE_TOKEN.WBTC,
        TS_BASE_TOKEN.ETH,
        liquidationFactor,
        wbtcAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty2 = calcProtocolPenaltyAmt(
        debtValue2,
        TS_BASE_TOKEN.WBTC,
        TS_BASE_TOKEN.ETH,
        liquidationFactor,
        wbtcAnswer
      );

      const removedCollateralAmt2 = liquidatorReward2.add(protocolPenalty2);

      // check balance
      expect(afterZkTrueUpWbtcBalance.sub(afterZkTrueUpWbtcBalance2)).to.eq(
        removedCollateralAmt2
      );
      expect(afterZkTrueUpWethBalance2.sub(afterZkTrueUpWethBalance)).to.eq(
        repayAmt2
      );
      expect(afterLiquidatorWbtcBalance2.sub(afterLiquidatorWbtcBalance)).to.eq(
        liquidatorReward2
      );
      expect(afterLiquidatorEthBalance.sub(repayAmt2).sub(liquidateGas2)).to.eq(
        afterLiquidatorEthBalance2
      );

      // check event
      await expect(liquidateTx2)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt2,
          loanData.debtTokenId,
          repayAmt2,
          false
        );
      await expect(liquidateTx2)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward2, protocolPenalty2);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted2 = toL2Amt(
        liquidatorReward2,
        TS_BASE_TOKEN.WBTC
      );

      const protocolPenaltyAmtConverted2 = toL2Amt(
        protocolPenalty2,
        TS_BASE_TOKEN.WBTC
      );

      const repayAmtConverted2 = toL2Amt(repayAmt2, TS_BASE_TOKEN.ETH);

      // new loan data after add collateral
      const newLoan2 = {
        ...newLoan,
        collateralAmt: BigNumber.from(newLoan.collateralAmt)
          .sub(liquidatorRewardAmtConverted2)
          .sub(protocolPenaltyAmtConverted2),
        debtAmt: BigNumber.from(newLoan.debtAmt).sub(repayAmtConverted2),
      };

      // get new expected health factor
      const newExpectedHealthFactor2 = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan2,
        wbtcAnswer,
        ethAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor2 = await diamondLoan.getHealthFactor(loanId);

      // check health factor equal to expected health factor
      expect(newHealthFactor2).to.equal(newExpectedHealthFactor2);
    });
    it("Success to liquidate (repay max 50% debt value), health factor < 1 (general loan, half liquidation, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // wbtc = 12000 usd, eth = 1000 usd
      // healthFactor = 0.96 < 1
      // collateral value > 10000 usd -> partial liquidation
      // set wbtc price
      const wbtcPriceFeed = priceFeeds[TsTokenId.WBTC];
      const wbtcRoundDataJSON =
        liquidationRoundDataJSON[Case.case7][TokenType.collateral];
      wbtcAnswer = await (
        await updateRoundData(operator, wbtcPriceFeed, wbtcRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case7][TokenType.debt];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWbtcBalance = await wbtc.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeLiquidatorWbtcBalance = await wbtc.balanceOf(liquidatorAddr);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeTreasuryWbtcBalance = await wbtc.balanceOf(treasuryAddr);

      // half liquidation,  repayAmt = debtAmt / 2
      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, maxRepayAmt, { value: maxRepayAmt });
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWbtcBalance = await wbtc.balanceOf(zkTrueUp.address);
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterLiquidatorWbtcBalance = await wbtc.balanceOf(liquidatorAddr);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterTreasuryWbtcBalance = await wbtc.balanceOf(treasuryAddr);

      // calculate expected amount
      const debtValue = maxRepayAmt.mul(ethAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.WBTC,
        TS_BASE_TOKEN.ETH,
        liquidationFactor,
        wbtcAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.WBTC,
        TS_BASE_TOKEN.ETH,
        liquidationFactor,
        wbtcAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWbtcBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWbtcBalance
      );
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.eq(
        maxRepayAmt
      );
      expect(beforeLiquidatorWbtcBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorWbtcBalance
      );
      expect(
        beforeLiquidatorEthBalance.sub(maxRepayAmt).sub(liquidateGas)
      ).to.eq(afterLiquidatorEthBalance);
      expect(beforeTreasuryWbtcBalance.add(protocolPenalty)).to.eq(
        afterTreasuryWbtcBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.WBTC
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.WBTC
      );

      const repayAmtConverted = toL2Amt(maxRepayAmt, TS_BASE_TOKEN.ETH);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        wbtcAnswer,
        ethAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor > 1, and equal to expected health factor
      expect(newHealthFactor).to.gt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
  });
  describe("Partial liquidation (stable coin pair case)", () => {
    const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = STABLECOIN_PAIR_LIQUIDATION_FACTOR;
    const tsbTokenData = tsbTokensJSON[4]; // tsb DAI
    const loanData = stableCoinPairLoanDataJSON[3]; // USDT -> DAI

    // collateral = 500000 usdt, debt = 462000 dai
    // collateral > 10000 usd
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let usdtAnswer: BigNumber;
    let daiAnswer: BigNumber;
    let usdt: ERC20Mock;
    let dai: ERC20Mock;

    beforeEach(async () => {
      // tsb dai
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsbMock,
        operator,
        tsbTokenData
      );

      // register by usdt
      const registerAmt = utils.parseUnits(
        "1000000",
        TS_BASE_TOKEN.USDT.decimals
      );
      // register user1
      await register(
        user1,
        Number(TsTokenId.USDT),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // set usdt contract
      usdt = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      )) as ERC20Mock;

      // mint default usdc to liquidator
      dai = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.DAI]
      )) as ERC20Mock;
      await dai
        .connect(liquidator)
        .mint(
          liquidatorAddr,
          utils.parseUnits("1000000", TS_BASE_TOKEN.DAI.decimals)
        );

      // approve usdc to zkTrueUp
      await dai
        .connect(liquidator)
        .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    });
    it("Success to liquidate (repay 5% debt value), health factor < 1 (stable coin pairs loan, half liquidation, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // usdt = 0.97 usd, dai = 1 usd
      // healthFactor = 0.971 < 1
      // collateral value > 10000 usd -> partial liquidation
      // set usdt price
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON =
        liquidationRoundDataJSON[Case.case4][TokenType.collateral];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON =
        liquidationRoundDataJSON[Case.case4][TokenType.debt];
      daiAnswer = await (
        await updateRoundData(operator, daiPriceFeed, daiRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const beforeLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      const repayAmt = maxRepayAmt.div(10); // 5% of debt value
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const afterLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const debtValue = repayAmt.mul(daiAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpUsdtBalance
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.eq(
        repayAmt
      );
      expect(beforeLiquidatorUsdtBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorUsdtBalance
      );
      expect(beforeLiquidatorDaiBalance.sub(afterLiquidatorDaiBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryUsdtBalance.add(protocolPenalty)).to.eq(
        afterTreasuryUsdtBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.USDT
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.DAI);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        daiAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor < 1, and equal to expected health factor
      expect(newHealthFactor).to.lt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay max 50% debt value), health factor < 1 (stable coin pairs loan, half liquidation, collateral can cover liquidator reward and protocol penalty)", async () => {
      // set the price for liquidation
      // usdt = 0.97 usd, dai = 1 usd
      // healthFactor = 0.971 < 1
      // collateral value > 10000 usd -> partial liquidation
      // set usdt price
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON =
        liquidationRoundDataJSON[Case.case4][TokenType.collateral];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON =
        liquidationRoundDataJSON[Case.case4][TokenType.debt];
      daiAnswer = await (
        await updateRoundData(operator, daiPriceFeed, daiRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const beforeLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      const [, , repayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const afterLiquidatorDaiBalance = await dai.balanceOf(liquidatorAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const debtValue = repayAmt.mul(daiAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.DAI,
        liquidationFactor,
        usdtAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpUsdtBalance
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.eq(
        repayAmt
      );
      expect(beforeLiquidatorUsdtBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorUsdtBalance
      );
      expect(beforeLiquidatorDaiBalance.sub(afterLiquidatorDaiBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryUsdtBalance.add(protocolPenalty)).to.eq(
        afterTreasuryUsdtBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.USDT
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.DAI);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        daiAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor < 1, and equal to expected health factor
      expect(newHealthFactor).to.lt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
  });
  describe("Full liquidation, loan is matured (general case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = LIQUIDATION_FACTOR;

    // use the matured tsb token
    const tsbTokenData = maturedTsbTokensJSON[0]; // tsb USDC
    const loanData = loanDataJSON[3]; // ETH -> USDC

    // collateral = 1 eth, debt = 500 usdc
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let ethAnswer: BigNumber;
    let usdcAnswer: BigNumber;
    let usdc: ERC20Mock;

    beforeEach(async () => {
      // tsb USDC
      // using test tsbFactory for ignore maturity check
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsbMock,
        operator,
        tsbTokenData
      );

      // ETH decimals = 18
      const decimals = 18;
      // register by ETH
      const registerAmt = utils.parseUnits("10", decimals);
      // register user1
      await register(
        user1,
        Number(TsTokenId.ETH),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // mint default usdc to liquidator
      usdc = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDC]
      )) as ERC20Mock;
      await usdc
        .connect(liquidator)
        .mint(
          liquidatorAddr,
          utils.parseUnits("10000", TS_BASE_TOKEN.USDC.decimals)
        );

      // approve usdc to zkTrueUp
      await usdc
        .connect(liquidator)
        .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    });
    it("Success to liquidate (repay 50% debt value), health factor > 1 but loan is matured", async () => {
      // set the price for liquidation
      // eth = 1200 usd, usdc = 1 usd
      // healthFactor = 1.92 > 1
      // loan is healthy, but is matured
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case8][TokenType.collateral];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case8][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // repay 50% debt value
      const repayAmt = maxRepayAmt.div(2);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );
      const debtValue = repayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWethBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        repayAmt
      );
      expect(
        beforeLiquidatorEthBalance.add(liquidatorReward).sub(liquidateGas)
      ).to.eq(afterLiquidatorEthBalance);
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryEthBalance.add(protocolPenalty)).to.eq(
        afterTreasuryEthBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.ETH
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.ETH
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay all debt value), health factor > 1 but loan is matured", async () => {
      // set the price for liquidation
      // eth = 1200 usd, usdc = 1 usd
      // healthFactor = 1.92 > 1
      // loan is healthy, but is matured
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON =
        liquidationRoundDataJSON[Case.case8][TokenType.collateral];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case8][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const [, , repayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // gas fee
      const liquidateGas = BigNumber.from(liquidateReceipt.gasUsed).mul(
        liquidateReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorEthBalance = await liquidator.getBalance();
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );
      const debtValue = repayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpWethBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        repayAmt
      );
      expect(
        beforeLiquidatorEthBalance.add(liquidatorReward).sub(liquidateGas)
      ).to.eq(afterLiquidatorEthBalance);
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryEthBalance.add(protocolPenalty)).to.eq(
        afterTreasuryEthBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.ETH
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.ETH
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
  });
  describe("Full liquidation, loan is matured (stable coin pair case)", () => {
    const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = STABLECOIN_PAIR_LIQUIDATION_FACTOR;

    // using matured tsb token
    const tsbTokenData = maturedTsbTokensJSON[0]; // tsb USDC
    const loanData = stableCoinPairLoanDataJSON[4]; // USDT -> USDC

    // collateral = 100000 usdt, debt = 90000 usdc
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let usdtAnswer: BigNumber;
    let usdcAnswer: BigNumber;
    let usdt: ERC20Mock;
    let usdc: ERC20Mock;

    beforeEach(async () => {
      // tsb dai
      // using testTsbFactory to ignore the maturity check
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsbMock,
        operator,
        tsbTokenData
      );

      // register by usdt
      const registerAmt = utils.parseUnits(
        "100000",
        TS_BASE_TOKEN.USDT.decimals
      );
      // register user1
      await register(
        user1,
        Number(TsTokenId.USDT),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // set usdt contract
      usdt = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      )) as ERC20Mock;

      // mint default usdc to liquidator
      usdc = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDC]
      )) as ERC20Mock;
      await usdc
        .connect(liquidator)
        .mint(
          liquidatorAddr,
          utils.parseUnits("100000", TS_BASE_TOKEN.USDC.decimals)
        );

      // approve usdc to zkTrueUp
      await usdc
        .connect(liquidator)
        .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    });
    it("Success to liquidate (repay 75% debt value), loan is healthy, but loan is matured", async () => {
      // set the price for liquidation
      // usdt = 1 usd, dai = 1 usd
      // healthFactor = 1.028 > 1
      // loan is healthy, but loan is matured
      // set usdt price
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON =
        liquidationRoundDataJSON[Case.case9][TokenType.collateral];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case9][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      const [, , maxRepayAmt] = await diamondLoan.isLiquidable(loanId);
      // repay 75% of debt value
      const repayAmt = maxRepayAmt.div(4).mul(3);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const debtValue = repayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        usdtAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        usdtAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpUsdtBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        repayAmt
      );
      expect(beforeLiquidatorUsdtBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorUsdtBalance
      );
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryUsdtBalance.add(protocolPenalty)).to.eq(
        afterTreasuryUsdtBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.USDT
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to liquidate (repay all debt value), loan is healthy, but loan is matured", async () => {
      // set the price for liquidation
      // usdt = 1 usd, dai = 1 usd
      // healthFactor = 1.028 > 1
      // loan is healthy, but loan is matured
      // set usdt price
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON =
        liquidationRoundDataJSON[Case.case9][TokenType.collateral];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON =
        liquidationRoundDataJSON[Case.case9][TokenType.debt];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);

      const [, , repayAmt] = await diamondLoan.isLiquidable(loanId);
      // liquidate
      const liquidateTx = await diamondLoan
        .connect(liquidator)
        .liquidate(loanId, repayAmt);
      const liquidateReceipt = await liquidateTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterLiquidatorUsdtBalance = await usdt.balanceOf(liquidatorAddr);
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const debtValue = repayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        usdtAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.USDT,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        usdtAnswer
      );
      const removedCollateralAmt = liquidatorReward.add(protocolPenalty);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(removedCollateralAmt)).to.eq(
        afterZkTrueUpUsdtBalance
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        repayAmt
      );
      expect(beforeLiquidatorUsdtBalance.add(liquidatorReward)).to.eq(
        afterLiquidatorUsdtBalance
      );
      expect(beforeLiquidatorUsdcBalance.sub(afterLiquidatorUsdcBalance)).to.eq(
        repayAmt
      );
      expect(beforeTreasuryUsdtBalance.add(protocolPenalty)).to.eq(
        afterTreasuryUsdtBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          liquidatorAddr,
          loan.collateralTokenId,
          removedCollateralAmt,
          loanData.debtTokenId,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(loanId, liquidatorAddr, liquidatorReward, protocolPenalty);

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        protocolPenalty,
        TS_BASE_TOKEN.USDT
      );

      const repayAmtConverted = toL2Amt(repayAmt, TS_BASE_TOKEN.USDC);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt)
          .sub(liquidatorRewardAmtConverted)
          .sub(protocolPenaltyAmtConverted),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repayAmtConverted),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
  });
  describe("Set & Get half liquidation threshold", () => {
    it("Success to set & get half liquidation threshold", async () => {
      const newHalfLiquidationThreshold = 5000;
      const setHalfLiquidationThresholdTx = await diamondLoan
        .connect(admin)
        .setHalfLiquidationThreshold(newHalfLiquidationThreshold);
      await setHalfLiquidationThresholdTx.wait();

      const halfLiquidationThreshold =
        await diamondLoan.getHalfLiquidationThreshold();
      expect(halfLiquidationThreshold).to.be.equal(newHalfLiquidationThreshold);
    });
    it("Fail to set half liquidation, sender is not admin", async () => {
      const newHalfLiquidationThreshold = 5000;
      await expect(
        diamondLoan
          .connect(user1)
          .setHalfLiquidationThreshold(newHalfLiquidationThreshold)
      ).to.be.reverted;
    });
  });
  describe("Set & Get liquidation factor", () => {
    it("Success to set & get liquidation factor", async () => {
      // new liquidation factor
      const newLiquidationFactor = {
        ltvThreshold: 700,
        liquidatorIncentive: 60,
        protocolPenalty: 40,
      };
      const isStableCoinPair = false;

      // set new liquidation factor
      const setLiquidationFactorTx = await diamondLoan
        .connect(admin)
        .setLiquidationFactor(newLiquidationFactor, isStableCoinPair);
      const setLiquidationFactorReceipt = await setLiquidationFactorTx.wait();

      // check
      const liquidationFactor = await diamondLoan.getLiquidationFactor(false);
      expect(liquidationFactor.ltvThreshold).to.be.equal(700);
      expect(liquidationFactor.liquidatorIncentive).to.be.equal(60);
      expect(liquidationFactor.protocolPenalty).to.be.equal(40);
    });
    it("Success to set & get stable coin pair liquidation factor", async () => {
      // new stable coin pair liquidation factor
      const newStableCoinPairLiquidationFactor = {
        ltvThreshold: 500,
        liquidatorIncentive: 60,
        protocolPenalty: 40,
      };
      const isStableCoinPair = true;

      // set new stable coin pair liquidation factor
      const setStableCoinPairLiquidationFactorTx = await diamondLoan
        .connect(admin)
        .setLiquidationFactor(
          newStableCoinPairLiquidationFactor,
          isStableCoinPair
        );

      // check
      const liquidationFactor = await diamondLoan.getLiquidationFactor(true);
      expect(liquidationFactor.ltvThreshold).to.be.equal(500);
      expect(liquidationFactor.liquidatorIncentive).to.be.equal(60);
      expect(liquidationFactor.protocolPenalty).to.be.equal(40);
    });
    it("Fail to set liquidation factor, sender is not admin", async () => {
      // new liquidation factor
      const newLiquidationFactor = {
        ltvThreshold: 700,
        liquidatorIncentive: 60,
        protocolPenalty: 40,
      };

      // set new liquidation factor with invalid sender
      const isStableCoinPair = false;
      await expect(
        diamondLoan
          .connect(user1)
          .setLiquidationFactor(newLiquidationFactor, isStableCoinPair)
      ).to.be.reverted;
    });
    it("Fail to set liquidation factor, invalid liquidation factor", async () => {
      // new liquidation factor
      const invalidLiquidationFactor = {
        ltvThreshold: 950,
        liquidatorIncentive: 60,
        protocolPenalty: 40,
      };
      const isStableCoinPair = false;

      // set invalid liquidation factor
      await expect(
        diamondLoan
          .connect(admin)
          .setLiquidationFactor(invalidLiquidationFactor, isStableCoinPair)
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidLiquidationFactor");
    });
  });
});

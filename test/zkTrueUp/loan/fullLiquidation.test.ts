const helpers = require("@nomicfoundation/hardhat-network-helpers");
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
  calcRepayValueEquivCollateralAmt,
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
  DEFAULT_ETH_ADDRESS,
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
  "EvacuationFacet",
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

// In full liquidation, the liquidator can liquidate max to 100% of the debt in two cases:
// 1. collateral < half liquidation threshold and health factor < 1
// 2. loan is matured
describe("Full liquidation, the liquidator can liquidate max to 100% of the debt", () => {
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

  describe("Full liquidation, collateral < half liquidation threshold (general case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = LIQUIDATION_FACTOR;
    const tsbTokenData = tsbTokensJSON[3]; // tsb USDC
    const loanData = loanDataJSON[3]; // ETH -> USDC

    // collateral = 1 eth, debt = 500 usdc
    const loan: LoanData = {
      accountId: loanData.accountId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtTokenId: loanData.debtTokenId,
      debtAmt: BigNumber.from(loanData.debtAmt),
      matchedTime: BigNumber.from(loanData.matchedTime),
      maturityTime: BigNumber.from(tsbTokenData.maturity),
    };
    let loanOwner: string;
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

      // get loan owner
      loanOwner = await diamondAcc.getAccountAddr(loan.accountId);

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
      const [isLiquidable, ,] = await diamondLoan.getLiquidationInfo(loanId);
      // liquidate
      expect(isLiquidable).to.be.false;
      await expect(
        diamondLoan.connect(liquidator).liquidate(loanId, repayAmt)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsSafe");
    });
    it("Success to liquidate (repay 5% debt value), health factor < 1 (general loan, collateral can cover liquidator reward and protocol penalty)", async () => {
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

      // old health factor
      const oldHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeLiquidatorEthBalance = await liquidator.getBalance();
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(liquidatorAddr);
      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );

      const [isLiquidable, , maxRepayAmt] =
        await diamondLoan.getLiquidationInfo(loanId);
      // repay 5% debt value
      const repayAmt = maxRepayAmt.div(20);
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        repayAmt,
        TS_BASE_TOKEN.ETH,
        ethAnswer,
        TS_BASE_TOKEN.USDC,
        usdcAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          DEFAULT_ETH_ADDRESS,
          liquidatorReward,
          protocolPenalty
        );

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
      expect(newHealthFactor).to.gt(oldHealthFactor);
      // check liquidation success even health factor < 1 after liquidation
      expect(newHealthFactor).to.lt(1000);
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

      const [isLiquidable, , maxRepayAmt] =
        await diamondLoan.getLiquidationInfo(loanId);
      // repay 80% debt value
      const repayAmt = maxRepayAmt.mul(8).div(10);
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        repayAmt,
        TS_BASE_TOKEN.ETH,
        ethAnswer,
        TS_BASE_TOKEN.USDC,
        usdcAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          DEFAULT_ETH_ADDRESS,
          liquidatorReward,
          protocolPenalty
        );

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

      const [isLiquidable, , maxRepayAmt] =
        await diamondLoan.getLiquidationInfo(loanId);
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        maxRepayAmt,
        TS_BASE_TOKEN.ETH,
        ethAnswer,
        TS_BASE_TOKEN.USDC,
        usdcAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          DEFAULT_ETH_ADDRESS,
          liquidatorReward,
          protocolPenalty
        );

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
    it("Success to liquidate (repay all debt value), health factor < 1 (general loan, collateral can cover liquidator reward but cannot cover full protocol penalty)", async () => {
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

      const [, , maxRepayAmt] = await diamondLoan.getLiquidationInfo(loanId);
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        maxRepayAmt,
        TS_BASE_TOKEN.ETH,
        ethAnswer,
        TS_BASE_TOKEN.USDC,
        usdcAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          DEFAULT_ETH_ADDRESS,
          liquidatorReward,
          protocolPenalty
        );

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

      const [, , maxRepayAmt] = await diamondLoan.getLiquidationInfo(loanId);
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          DEFAULT_ETH_ADDRESS,
          liquidatorReward,
          protocolPenalty
        );

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
  describe("Full liquidation, collateral < half liquidation threshold (stable coin pair case)", () => {
    const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = STABLECOIN_PAIR_LIQUIDATION_FACTOR;
    const tsbTokenData = tsbTokensJSON[4]; // tsb DAI
    const loanData = stableCoinPairLoanDataJSON[1]; // USDT -> DAI

    // collateral = 100 usdt, debt = 90 dai
    const loan: LoanData = {
      accountId: loanData.accountId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtTokenId: loanData.debtTokenId,
      debtAmt: BigNumber.from(loanData.debtAmt),
      matchedTime: BigNumber.from(loanData.matchedTime),
      maturityTime: BigNumber.from(tsbTokenData.maturity),
    };
    let loanOwner: string;
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

      // get loan owner
      loanOwner = await diamondAcc.getAccountAddr(loan.accountId);

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

      const [, , maxRepayAmt] = await diamondLoan.getLiquidationInfo(loanId);
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        repayAmt,
        TS_BASE_TOKEN.USDT,
        usdtAnswer,
        TS_BASE_TOKEN.DAI,
        daiAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          usdt.address,
          dai.address,
          removedCollateralAmt,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          usdt.address,
          liquidatorReward,
          protocolPenalty
        );

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

      const [, , maxRepayAmt] = await diamondLoan.getLiquidationInfo(loanId);
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        maxRepayAmt,
        TS_BASE_TOKEN.USDT,
        usdtAnswer,
        TS_BASE_TOKEN.DAI,
        daiAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          usdt.address,
          dai.address,
          removedCollateralAmt,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          usdt.address,
          liquidatorReward,
          protocolPenalty
        );

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

      const [, , maxRepayAmt] = await diamondLoan.getLiquidationInfo(loanId);
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        maxRepayAmt,
        TS_BASE_TOKEN.USDT,
        usdtAnswer,
        TS_BASE_TOKEN.DAI,
        daiAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const fullProtocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // leftover protocol penalty with collateral token L1 decimals
      const leftoverProtocolPenalty = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      ).sub(liquidatorReward);
      const removedCollateralAmt = liquidatorReward.add(
        leftoverProtocolPenalty
      );

      expect(fullProtocolPenalty).to.gt(leftoverProtocolPenalty);

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
      expect(beforeTreasuryUsdtBalance.add(leftoverProtocolPenalty)).to.eq(
        afterTreasuryUsdtBalance
      );

      // check event
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          usdt.address,
          dai.address,
          removedCollateralAmt,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          usdt.address,
          liquidatorReward,
          leftoverProtocolPenalty
        );

      // convert amount to 8 decimals for loan data
      const liquidatorRewardAmtConverted = toL2Amt(
        liquidatorReward,
        TS_BASE_TOKEN.USDT
      );

      const protocolPenaltyAmtConverted = toL2Amt(
        leftoverProtocolPenalty,
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

      const [, , maxRepayAmt] = await diamondLoan.getLiquidationInfo(loanId);
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          usdt.address,
          dai.address,
          removedCollateralAmt,
          maxRepayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          usdt.address,
          liquidatorReward,
          protocolPenalty
        );

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
  describe("Full liquidation, loan is matured (general case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const liquidationFactor = LIQUIDATION_FACTOR;

    // use the matured tsb token
    const tsbTokenData = maturedTsbTokensJSON[0]; // tsb USDC
    const loanData = loanDataJSON[3]; // ETH -> USDC

    // collateral = 1 eth, debt = 500 usdc
    const loan: LoanData = {
      accountId: loanData.accountId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtTokenId: loanData.debtTokenId,
      debtAmt: BigNumber.from(loanData.debtAmt),
      matchedTime: BigNumber.from(loanData.matchedTime),
      maturityTime: BigNumber.from(tsbTokenData.maturity),
    };
    let loanOwner: string;
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

      // get loan owner
      loanOwner = await diamondAcc.getAccountAddr(loan.accountId);

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

      const [, , maxRepayAmt] = await diamondLoan.getLiquidationInfo(loanId);
      // repay 50% debt value
      const repayAmt = maxRepayAmt.div(2);
      // liquidate

      await helpers.time.increaseTo(1672416000); // maturity time
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        repayAmt,
        TS_BASE_TOKEN.ETH,
        ethAnswer,
        TS_BASE_TOKEN.USDC,
        usdcAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          DEFAULT_ETH_ADDRESS,
          liquidatorReward,
          protocolPenalty
        );

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

      const [, , repayAmt] = await diamondLoan.getLiquidationInfo(loanId);
      // liquidate
      await helpers.time.increaseTo(1672416000); // maturity time
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        repayAmt,
        TS_BASE_TOKEN.ETH,
        ethAnswer,
        TS_BASE_TOKEN.USDC,
        usdcAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          DEFAULT_ETH_ADDRESS,
          liquidatorReward,
          protocolPenalty
        );

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
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtTokenId: loanData.debtTokenId,
      debtAmt: BigNumber.from(loanData.debtAmt),
      matchedTime: BigNumber.from(loanData.matchedTime),
      maturityTime: BigNumber.from(tsbTokenData.maturity),
    };
    let loanOwner: string;
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

      // get loan owner
      loanOwner = await diamondAcc.getAccountAddr(loan.accountId);

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
      // usdt = 1 usd, usdc = 1 usd
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

      const [, , maxRepayAmt] = await diamondLoan.getLiquidationInfo(loanId);
      // repay 75% of debt value
      const repayAmt = maxRepayAmt.div(4).mul(3);
      await helpers.time.increaseTo(1672416000); // maturity time
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        repayAmt,
        TS_BASE_TOKEN.USDT,
        usdtAnswer,
        TS_BASE_TOKEN.USDC,
        usdcAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          usdt.address,
          usdc.address,
          removedCollateralAmt,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          usdt.address,
          liquidatorReward,
          protocolPenalty
        );

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
      // usdt = 1 usd, usdc = 1 usd
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

      const [, , repayAmt] = await diamondLoan.getLiquidationInfo(loanId);
      await helpers.time.increaseTo(1672416000); // maturity time
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

      // repay value equivalent collateral amount with collateral token L1 decimals
      const repayValueEquivCollateralAmt = calcRepayValueEquivCollateralAmt(
        repayAmt,
        TS_BASE_TOKEN.USDT,
        usdtAnswer,
        TS_BASE_TOKEN.USDC,
        usdcAnswer
      );

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = calcLiquidatorRewardAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = calcProtocolPenaltyAmt(
        repayValueEquivCollateralAmt,
        liquidationFactor
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
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          liquidatorAddr,
          loanOwner,
          usdt.address,
          usdc.address,
          removedCollateralAmt,
          repayAmt,
          false
        );
      await expect(liquidateTx)
        .to.emit(diamondLoan, "Liquidation")
        .withArgs(
          loanId,
          liquidatorAddr,
          usdt.address,
          liquidatorReward,
          protocolPenalty
        );

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
});

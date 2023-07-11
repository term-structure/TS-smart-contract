import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { register } from "../../utils/register";
import { BaseTokenAddresses, LoanData, PriceFeeds } from "../../../utils/type";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { loanDataJSON, stableCoinPairLoanDataJSON } from "../../data/loanData";
import { updateRoundData } from "../../utils/updateRoundData";
import { toL1Amt, toL2Amt } from "../../utils/amountConvertor";
import { roundDataJSON } from "../../data/roundData";
import { getExpectedHealthFactor } from "../../utils/getHealthFactor";
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
  TsbFacet,
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

//! use RollupMock instead of RollupFacet for testing
export const FACET_NAMES_MOCK = [
  "AccountFacet",
  "AddressFacet",
  "FlashLoanFacet",
  "ProtocolParamsFacet",
  "LoanFacet",
  "RollupMock", // replace RollupFacet with RollupMock
  "TokenFacet",
  "TsbFacet",
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

describe("Repay", () => {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondLoan: LoanFacet;
  let diamondRollupMock: RollupMock;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let priceFeeds: PriceFeeds;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    operator = res.operator;
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
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    priceFeeds = res.priceFeeds;
  });

  describe("Repay (ETH case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const tsbTokenData = tsbTokensJSON.filter(
      (token) => token.underlyingAsset === "USDC"
    )[0];
    const loanData = loanDataJSON[3]; // ETH -> USDC
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
        diamondTsb,
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

      // get eth price with 8 decimals from test oracle
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON = roundDataJSON[TsTokenId.ETH][0];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON = roundDataJSON[TsTokenId.USDC][0];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // give user1 10000 USDC for repay test
      usdc = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDC]
      );
      const amount = utils.parseUnits("10000", TS_BASE_TOKEN.USDC.decimals);
      await usdc.connect(user1).mint(user1Addr, amount);

      // user1 approve to ZkTrueUp
      await usdc
        .connect(user1)
        .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    });
    it("Success to repay, fully repay and take all collateral (ETH case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // repay 500 USDC (all debt) and take 1 ETH (all collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      const repayTx = await diamondLoan
        .connect(user1)
        .repay(loanId, collateralAmt, debtAmt, false);
      const repayReceipt = await repayTx.wait();

      // gas fee
      const repayGas = BigNumber.from(repayReceipt.gasUsed).mul(
        repayReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.eq(
        collateralAmt
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        debtAmt
      );
      expect(
        afterUser1EthBalance.add(repayGas).sub(beforeUser1EthBalance)
      ).to.eq(collateralAmt);
      expect(beforeUser1UsdcBalance.sub(afterUser1UsdcBalance)).to.eq(debtAmt);

      // check event
      await expect(repayTx)
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          user1Addr,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          collateralAmt,
          debtAmt,
          false
        );

      /// check loan data after repay
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.collateralAmt).to.eq(0);
      expect(newLoanInfo.debtAmt).to.eq(0);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDC);

      const removedCollateralAmtConverted = toL2Amt(
        collateralAmt,
        TS_BASE_TOKEN.ETH
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
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
    it("Success to repay, fully repay and take partial collateral (ETH case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // repay 500 USDC (all debt) and take 0.5 ETH (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );
      const removedCollateralAmt = BigNumber.from(collateralAmt).div(2);
      const repayTx = await diamondLoan
        .connect(user1)
        .repay(loanId, removedCollateralAmt, debtAmt, false);
      const repayReceipt = await repayTx.wait();

      // gas fee
      const repayGas = BigNumber.from(repayReceipt.gasUsed).mul(
        repayReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.eq(
        removedCollateralAmt
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        debtAmt
      );
      expect(
        afterUser1EthBalance.add(repayGas).sub(beforeUser1EthBalance)
      ).to.eq(removedCollateralAmt);
      expect(beforeUser1UsdcBalance.sub(afterUser1UsdcBalance)).to.eq(debtAmt);

      // check event
      await expect(repayTx)
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          user1Addr,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          debtAmt,
          false
        );

      /// check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.collateralAmt).to.eq(
        BigNumber.from(collateralAmt).sub(removedCollateralAmt)
      );
      expect(newLoanInfo.debtAmt).to.eq(0);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDC);

      const removedCollateralAmtConverted = toL2Amt(
        removedCollateralAmt,
        TS_BASE_TOKEN.ETH
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
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
    it("Success to repay, fully repay and take partial collateral twice (ETH case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // repay 500 USDC (all debt) and take 0.5 ETH (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      const firstRemovedCollateralAmt = BigNumber.from(collateralAmt).div(2);
      const repayTx = await diamondLoan
        .connect(user1)
        .repay(loanId, firstRemovedCollateralAmt, debtAmt, false);
      const repayReceipt = await repayTx.wait();

      // remove remaining collateral
      const secondRemovedCollateralAmt = BigNumber.from(collateralAmt).div(2);
      const removeCollateralTx = await diamondLoan
        .connect(user1)
        .removeCollateral(loanId, secondRemovedCollateralAmt);
      const removeCollateralReceipt = await removeCollateralTx.wait();

      // gas fee
      const repayGas = BigNumber.from(repayReceipt.gasUsed).mul(
        repayReceipt.effectiveGasPrice
      );
      const removeCollateralGas = BigNumber.from(
        removeCollateralReceipt.gasUsed
      ).mul(removeCollateralReceipt.effectiveGasPrice);

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // total amount
      const totalGas = repayGas.add(removeCollateralGas);
      const totalRemovedCollateralAmt = firstRemovedCollateralAmt.add(
        secondRemovedCollateralAmt
      );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.collateralAmt).to.eq(0);
      expect(newLoanInfo.debtAmt).to.eq(0);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.eq(
        totalRemovedCollateralAmt
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        debtAmt
      );
      expect(
        afterUser1EthBalance.add(totalGas).sub(beforeUser1EthBalance)
      ).to.eq(totalRemovedCollateralAmt);
      expect(beforeUser1UsdcBalance.sub(afterUser1UsdcBalance)).to.eq(debtAmt);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDC);

      const removedCollateralAmtConverted = toL2Amt(
        totalRemovedCollateralAmt,
        TS_BASE_TOKEN.ETH
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
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
    it("Success to repay, partial repay and take partial collateral (ETH case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // repay 300 USDC (60% debt) and take 0.5 ETH (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const repayDebtAmt = BigNumber.from(debtAmt).mul(3).div(5);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );
      const removedCollateralAmt = BigNumber.from(collateralAmt).div(2);
      const repayTx = await diamondLoan
        .connect(user1)
        .repay(loanId, removedCollateralAmt, repayDebtAmt, false);
      const repayReceipt = await repayTx.wait();

      // gas fee
      const repayGas = BigNumber.from(repayReceipt.gasUsed).mul(
        repayReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.eq(
        removedCollateralAmt
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        repayDebtAmt
      );
      expect(
        afterUser1EthBalance.add(repayGas).sub(beforeUser1EthBalance)
      ).to.eq(removedCollateralAmt);
      expect(beforeUser1UsdcBalance.sub(afterUser1UsdcBalance)).to.eq(
        repayDebtAmt
      );

      // check event
      await expect(repayTx)
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          user1Addr,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          removedCollateralAmt,
          repayDebtAmt,
          false
        );

      // get new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.collateralAmt).to.eq(
        BigNumber.from(collateralAmt).sub(removedCollateralAmt)
      );
      expect(newLoanInfo.debtAmt).to.eq(
        BigNumber.from(debtAmt).sub(repayDebtAmt)
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(repayDebtAmt, TS_BASE_TOKEN.USDC);

      const removedCollateralAmtConverted = toL2Amt(
        removedCollateralAmt,
        TS_BASE_TOKEN.ETH
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
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
    it("Fail to repay (ETH case), not the loan owner", async () => {
      // user2 repay 300 USDC (60% debt) and take 0.5 ETH (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const repayDebtAmt = BigNumber.from(debtAmt).mul(3).div(5);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );
      const removedCollateralAmt = BigNumber.from(collateralAmt).div(2);
      await expect(
        diamondLoan
          .connect(user2)
          .repay(loanId, removedCollateralAmt, repayDebtAmt, false)
      ).to.be.revertedWithCustomError(diamondLoan, "isNotLoanOwner");
    });
    it("Fail to repay (ETH case), health factor under threshold", async () => {
      // before health factor
      const beforeHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // repay 100 USDC (20% debt) and take 0.8 ETH (80% collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const repayDebtAmt = BigNumber.from(debtAmt).div(5);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );
      const removedCollateralAmt = BigNumber.from(collateralAmt).mul(4).div(5);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(repayDebtAmt, TS_BASE_TOKEN.USDC);
      const removedCollateralAmtConverted = toL2Amt(
        removedCollateralAmt,
        TS_BASE_TOKEN.ETH
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
      };

      // get expected health factor will be under threshold
      const expectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // check expected health factor is under threshold
      expect(expectedHealthFactor).to.lt(1000);

      await expect(
        diamondLoan
          .connect(user1)
          .repay(loanId, removedCollateralAmt, repayDebtAmt, false)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsUnhealthy");

      // after health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(beforeHealthFactor).to.equal(newHealthFactor);
    });
    it("Fail to remove collateral after fully repay and take all collateral (ETH case)", async () => {
      // repay 500 USDC (all debt) and take 1 ETH (all collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      const repayTx = await diamondLoan
        .connect(user1)
        .repay(loanId, collateralAmt, debtAmt, false);
      const repayReceipt = await repayTx.wait();

      const removedCollateralAmt = toL2Amt(collateralAmt, TS_BASE_TOKEN.ETH);

      await expect(
        diamondLoan
          .connect(user1)
          .removeCollateral(loanId, removedCollateralAmt)
      ).to.be.reverted;
    });
  });
  describe("Repay (stable coin pairs case)", () => {
    const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
    const tsbTokenData = tsbTokensJSON.filter(
      (token) => token.underlyingAsset === "DAI"
    )[0];
    const loanData = stableCoinPairLoanDataJSON[1]; // USDT -> DAI, loan owner is user2
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
      // tsb USDC
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsb,
        operator,
        tsbTokenData
      );

      // USDT decimals = 6
      const decimals = TS_BASE_TOKEN.USDT.decimals;
      // register by USDT
      const registerAmt = utils.parseUnits("1000", decimals);
      // register user1
      await register(
        user1,
        Number(TsTokenId.USDT),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // DAI decimals = 18
      const decimals2 = TS_BASE_TOKEN.DAI.decimals;
      // register by DAI
      const registerAmt2 = utils.parseUnits("10", decimals2);
      // register user2
      await register(
        user2,
        Number(TsTokenId.DAI),
        registerAmt2,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get usdt price with 8 decimals from test oracle
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON = roundDataJSON[Number(TsTokenId.USDT)][0];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON = roundDataJSON[Number(TsTokenId.DAI)][0];
      daiAnswer = await (
        await updateRoundData(operator, daiPriceFeed, daiRoundDataJSON)
      ).answer;

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // get usdt contract
      usdt = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      );

      // give user2 10000 DAI for repay test
      dai = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.DAI]
      );
      const amount = utils.parseUnits("10000", TS_BASE_TOKEN.DAI.decimals);
      await dai.connect(user2).mint(user2Addr, amount);

      // user2 approve to ZkTrueUp
      await dai
        .connect(user2)
        .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    });
    it("Success to repay, fully repay and take all collateral (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);

      // repay 90 DAI (all debt) and take 100 USDT (all collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.DAI
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      );
      diamondLoan;
      const repayTx = await diamondLoan
        .connect(user2)
        .repay(loanId, collateralAmt, debtAmt, false);
      const repayReceipt = await repayTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(afterZkTrueUpUsdtBalance)).to.equal(
        collateralAmt
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.equal(
        debtAmt
      );
      expect(afterUser2UsdtBalance.sub(beforeUser2UsdtBalance)).to.equal(
        collateralAmt
      );
      expect(beforeUser2DaiBalance.sub(afterUser2DaiBalance)).to.equal(debtAmt);

      // check event
      await expect(repayTx)
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          user2Addr,
          usdt.address,
          dai.address,
          collateralAmt,
          debtAmt,
          false
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(0);
      expect(newLoanInfo.collateralAmt).to.equal(0);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.DAI);
      const removedCollateralAmtConverted = toL2Amt(
        collateralAmt,
        TS_BASE_TOKEN.USDT
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
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
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to repay, fully repay and take partial collateral (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);

      // repay 90 DAI (all debt) and take 80 USDT (80% collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.DAI
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      );
      const removedCollateralAmt = BigNumber.from(collateralAmt).mul(4).div(5);
      const repayTx = await diamondLoan
        .connect(user2)
        .repay(loanId, removedCollateralAmt, debtAmt, false);
      const repayReceipt = await repayTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(afterZkTrueUpUsdtBalance)).to.equal(
        removedCollateralAmt
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.equal(
        debtAmt
      );
      expect(afterUser2UsdtBalance.sub(beforeUser2UsdtBalance)).to.equal(
        removedCollateralAmt
      );
      expect(beforeUser2DaiBalance.sub(afterUser2DaiBalance)).to.equal(debtAmt);

      // check event
      await expect(repayTx)
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          user2Addr,
          usdt.address,
          dai.address,
          removedCollateralAmt,
          debtAmt,
          false
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(0);
      expect(newLoanInfo.collateralAmt).to.equal(
        BigNumber.from(collateralAmt).sub(removedCollateralAmt)
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.DAI);
      const removedCollateralAmtConverted = toL2Amt(
        removedCollateralAmt,
        TS_BASE_TOKEN.USDT
      );
      // new loan data after add collateral
      const newLoan = {
        ...loan,
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
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
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to repay, partial repay and take partial collateral (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);

      // repay 45 DAI (half debt) and take 50 USDT (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.DAI
      );
      const repayDebtAmt = BigNumber.from(debtAmt).div(2);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      );
      const removedCollateralAmt = BigNumber.from(collateralAmt).div(2);

      const repayTx = await diamondLoan
        .connect(user2)
        .repay(loanId, removedCollateralAmt, repayDebtAmt, false);
      const repayReceipt = await repayTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);

      // check balance
      expect(beforeZkTrueUpUsdtBalance.sub(afterZkTrueUpUsdtBalance)).to.equal(
        removedCollateralAmt
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.equal(
        repayDebtAmt
      );
      expect(afterUser2UsdtBalance.sub(beforeUser2UsdtBalance)).to.equal(
        removedCollateralAmt
      );
      expect(beforeUser2DaiBalance.sub(afterUser2DaiBalance)).to.equal(
        repayDebtAmt
      );

      // check event
      await expect(repayTx)
        .to.emit(diamondLoan, "Repayment")
        .withArgs(
          loanId,
          user2Addr,
          usdt.address,
          dai.address,
          removedCollateralAmt,
          repayDebtAmt,
          false
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(
        BigNumber.from(debtAmt).sub(repayDebtAmt)
      );
      expect(newLoanInfo.collateralAmt).to.equal(
        BigNumber.from(collateralAmt).sub(removedCollateralAmt)
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(repayDebtAmt, TS_BASE_TOKEN.DAI);
      const removedCollateralAmtConverted = toL2Amt(
        removedCollateralAmt,
        TS_BASE_TOKEN.USDT
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
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
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to repay, partial repay twice and take partial collateral twice (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);

      // first repay 45 DAI (half debt) and take 50 USDT (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.DAI
      );
      const firstRepayDebtAmt = BigNumber.from(debtAmt).div(2);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      );
      const firstRemovedCollateralAmt = BigNumber.from(collateralAmt).div(2);

      const firstRepayTx = await diamondLoan
        .connect(user2)
        .repay(loanId, firstRemovedCollateralAmt, firstRepayDebtAmt, false);
      const firstRepayReceipt = await firstRepayTx.wait();

      // second repay 45 DAI (half debt) and take 50 USDT (half collateral)
      const secondRepayDebtAmt = BigNumber.from(debtAmt).div(2);
      const secondRemovedCollateralAmt = BigNumber.from(collateralAmt).div(2);

      const secondRepayTx = await diamondLoan
        .connect(user2)
        .repay(loanId, secondRemovedCollateralAmt, secondRepayDebtAmt, false);
      const secondRepayReceipt = await secondRepayTx.wait();

      // after balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(0);
      expect(newLoanInfo.collateralAmt).to.equal(0);

      // check balance
      const totalDebtAmt = firstRepayDebtAmt.add(secondRepayDebtAmt);
      const totalCollateralAmt = firstRemovedCollateralAmt.add(
        secondRemovedCollateralAmt
      );
      expect(beforeZkTrueUpUsdtBalance.sub(afterZkTrueUpUsdtBalance)).to.equal(
        totalCollateralAmt
      );
      expect(afterZkTrueUpDaiBalance.sub(beforeZkTrueUpDaiBalance)).to.equal(
        totalDebtAmt
      );
      expect(afterUser2UsdtBalance.sub(beforeUser2UsdtBalance)).to.equal(
        totalCollateralAmt
      );
      expect(beforeUser2DaiBalance.sub(afterUser2DaiBalance)).to.equal(
        totalDebtAmt
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(totalDebtAmt, TS_BASE_TOKEN.DAI);
      const removedCollateralAmtConverted = toL2Amt(
        totalCollateralAmt,
        TS_BASE_TOKEN.USDT
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
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
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Fail to repay (stable coin pair), health factor under threshold", async () => {
      // repay 10 DAI (1/9 debt) and take 50 USDT (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.DAI
      );
      const repayDebtAmt = BigNumber.from(debtAmt).div(9);

      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      );
      const removedCollateralAmt = BigNumber.from(collateralAmt).div(2);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(repayDebtAmt, TS_BASE_TOKEN.DAI);
      const removedCollateralAmtConverted = toL2Amt(
        removedCollateralAmt,
        TS_BASE_TOKEN.USDT
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
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

      // check health factor under threshold
      expect(newExpectedHealthFactor).to.lt(1000);

      // check revert
      await expect(
        diamondLoan
          .connect(user2)
          .repay(loanId, removedCollateralAmt, repayDebtAmt, false)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsUnhealthy");
    });
  });
});

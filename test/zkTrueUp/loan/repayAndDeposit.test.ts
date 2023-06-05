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
  AccountLib,
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

describe("Repay and deposit", () => {
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
  let diamondWithAccountLib: AccountLib;

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
    diamondWithAccountLib = await ethers.getContractAt(
      "AccountLib",
      zkTrueUp.address
    );
  });

  describe("Repay and deposit (general case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const tsbTokenData = tsbTokensJSON.filter(
      (token) => token.underlyingAsset === "ETH"
    )[0];
    const loanData = loanDataJSON[2]; // DAI -> ETH
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let ethAnswer: BigNumber;
    let daiAnswer: BigNumber;
    let dai: ERC20Mock;

    beforeEach(async () => {
      // tsb USDC
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsb,
        operator,
        tsbTokenData
      );

      // register by DAI
      const registerAmt = utils.parseUnits("10000", TS_BASE_TOKEN.DAI.decimals);
      // register user1
      await register(
        user1,
        Number(TsTokenId.DAI),
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

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON = roundDataJSON[TsTokenId.DAI][0];
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

      // dai contract
      dai = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.DAI]
      )) as ERC20Mock;
    });
    it("Success to repay and deposit, fully repay and fully deposit (general case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1DaiBalance = await dai.balanceOf(user1Addr);

      // repay 5 ETH (all debt) and deposit 10000 DAI (all collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.ETH
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );

      const repayAndDepositTx = await diamondLoan
        .connect(user1)
        .repay(loanId, collateralAmt, debtAmt, true, { value: debtAmt });
      const repayAndDepositReceipt = await repayAndDepositTx.wait();

      // gas fee
      const repayAndDepositGas = BigNumber.from(
        repayAndDepositReceipt.gasUsed
      ).mul(repayAndDepositReceipt.effectiveGasPrice);

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1DaiBalance = await dai.balanceOf(user1Addr);

      // check balance
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.equal(
        debtAmt
      );
      expect(afterZkTrueUpDaiBalance).to.equal(beforeZkTrueUpDaiBalance);
      expect(afterUser1EthBalance).to.equal(
        beforeUser1EthBalance.sub(debtAmt).sub(repayAndDepositGas)
      );
      expect(afterUser1DaiBalance).to.equal(beforeUser1DaiBalance);

      // check event
      await expect(repayAndDepositTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user1Addr,
          dai.address,
          DEFAULT_ETH_ADDRESS,
          collateralAmt,
          debtAmt,
          true
        );
      await expect(repayAndDepositTx)
        .to.emit(diamondWithAccountLib, "Deposit")
        .withArgs(
          user1Addr,
          loan.accountId,
          loan.collateralTokenId,
          collateralAmt
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(0);
      expect(newLoanInfo.collateralAmt).to.equal(0);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.ETH);
      const removedCollateralAmtConverted = toL2Amt(
        collateralAmt,
        TS_BASE_TOKEN.DAI
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
      };

      // get new expected health factor (max uint256)
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        daiAnswer,
        ethAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newExpectedHealthFactor).to.equal(newHealthFactor);
    });
    it("Success to repay and deposit, fully repay and partial deposit (general case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1DaiBalance = await dai.balanceOf(user1Addr);

      // repay 5 ETH (all debt) and deposit 5000 DAI (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.ETH
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const removedCollateralAmt = BigNumber.from(collateralAmt).div(2);
      const repayAndDepositTx = await diamondLoan
        .connect(user1)
        .repay(loanId, removedCollateralAmt, debtAmt, true, { value: debtAmt });
      const repayAndDepositReceipt = await repayAndDepositTx.wait();

      // gas fee
      const repayAndDepositGas = BigNumber.from(
        repayAndDepositReceipt.gasUsed
      ).mul(repayAndDepositReceipt.effectiveGasPrice);

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1DaiBalance = await dai.balanceOf(user1Addr);

      // check balance
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.equal(
        debtAmt
      );
      expect(afterZkTrueUpDaiBalance).to.equal(beforeZkTrueUpDaiBalance);
      expect(afterUser1EthBalance).to.equal(
        beforeUser1EthBalance.sub(debtAmt).sub(repayAndDepositGas)
      );
      expect(afterUser1DaiBalance).to.equal(beforeUser1DaiBalance);

      // check event
      await expect(repayAndDepositTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user1Addr,
          dai.address,
          DEFAULT_ETH_ADDRESS,
          removedCollateralAmt,
          debtAmt,
          true
        );

      await expect(repayAndDepositTx)
        .to.emit(diamondWithAccountLib, "Deposit")
        .withArgs(
          user1Addr,
          loan.accountId,
          loan.collateralTokenId,
          removedCollateralAmt
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(0);
      expect(newLoanInfo.collateralAmt).to.equal(
        BigNumber.from(collateralAmt).sub(removedCollateralAmt)
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.ETH);
      const removedCollateralAmtConverted = toL2Amt(
        removedCollateralAmt,
        TS_BASE_TOKEN.DAI
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
      };

      // get new expected health factor (max uint256)
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        daiAnswer,
        ethAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newExpectedHealthFactor).to.equal(newHealthFactor);
    });
    it("Success to repay and deposit, fully repay and partial deposit + remove collateral (general case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1DaiBalance = await dai.balanceOf(user1Addr);

      // repay 5 ETH (all debt) and deposit 5000 DAI (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.ETH
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const depositCollateralAmt = BigNumber.from(collateralAmt).div(2);
      const repayAndDepositTx = await diamondLoan
        .connect(user1)
        .repay(loanId, depositCollateralAmt, debtAmt, true, {
          value: debtAmt,
        });
      const repayAndDepositReceipt = await repayAndDepositTx.wait();

      // removed remaining collateral amount (half collateral)
      const secondRemovedCollateralAmt = BigNumber.from(collateralAmt).div(2);
      const removeCollateralTx = await diamondLoan
        .connect(user1)
        .removeCollateral(loanId, secondRemovedCollateralAmt);
      const removeCollateralReceipt = await removeCollateralTx.wait();

      // gas fee
      const repayAndDepositGas = BigNumber.from(
        repayAndDepositReceipt.gasUsed
      ).mul(repayAndDepositReceipt.effectiveGasPrice);
      const removeCollateralGas = BigNumber.from(
        removeCollateralReceipt.gasUsed
      ).mul(removeCollateralReceipt.effectiveGasPrice);

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1DaiBalance = await dai.balanceOf(user1Addr);

      // check balance
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.equal(
        debtAmt
      );
      expect(beforeZkTrueUpDaiBalance.sub(afterZkTrueUpDaiBalance)).to.equal(
        depositCollateralAmt
      );
      expect(afterUser1EthBalance).to.equal(
        beforeUser1EthBalance
          .sub(debtAmt)
          .sub(repayAndDepositGas.add(removeCollateralGas))
      );
      expect(afterUser1DaiBalance.sub(beforeUser1DaiBalance)).to.equal(
        depositCollateralAmt
      );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(0);
      expect(newLoanInfo.collateralAmt).to.equal(0);

      // get total removed collateral amount
      const totalRemovedCollateralAmt = depositCollateralAmt.add(
        secondRemovedCollateralAmt
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.ETH);
      const removedCollateralAmtConverted = toL2Amt(
        totalRemovedCollateralAmt,
        TS_BASE_TOKEN.DAI
      );

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
        debtAmt: BigNumber.from(loan.debtAmt).sub(repaidDebtAmtConverted),
      };

      // get new expected health factor (max uint256)
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        daiAnswer,
        ethAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newExpectedHealthFactor).to.equal(newHealthFactor);
    });
    it("Success to repay and deposit, partial repay and partial deposit (general case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1DaiBalance = await dai.balanceOf(user1Addr);

      // repay 2.5 ETH (half debt) and deposit 5000 DAI (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.ETH
      );
      const repayDebtAmt = BigNumber.from(debtAmt).div(2);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const depositCollateralAmt = BigNumber.from(collateralAmt).div(2);

      const repayAndDepositTx = await diamondLoan
        .connect(user1)
        .repay(loanId, depositCollateralAmt, repayDebtAmt, true, {
          value: repayDebtAmt,
        });
      const repayAndDepositReceipt = await repayAndDepositTx.wait();

      // gas fee
      const repayAndDepositGas = BigNumber.from(
        repayAndDepositReceipt.gasUsed
      ).mul(repayAndDepositReceipt.effectiveGasPrice);

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1DaiBalance = await dai.balanceOf(user1Addr);

      // check balance
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.equal(
        repayDebtAmt
      );
      expect(afterZkTrueUpDaiBalance).to.equal(beforeZkTrueUpDaiBalance);
      expect(afterUser1EthBalance).to.equal(
        beforeUser1EthBalance.sub(repayDebtAmt).sub(repayAndDepositGas)
      );
      expect(afterUser1DaiBalance).to.equal(beforeUser1DaiBalance);

      // check event
      await expect(repayAndDepositTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user1Addr,
          dai.address,
          DEFAULT_ETH_ADDRESS,
          depositCollateralAmt,
          repayDebtAmt,
          true
        );
      await expect(repayAndDepositTx)
        .to.emit(diamondWithAccountLib, "Deposit")
        .withArgs(
          user1Addr,
          loan.accountId,
          loan.collateralTokenId,
          depositCollateralAmt
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(
        BigNumber.from(debtAmt).sub(repayDebtAmt)
      );
      expect(newLoanInfo.collateralAmt).to.equal(
        BigNumber.from(collateralAmt).sub(depositCollateralAmt)
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(repayDebtAmt, TS_BASE_TOKEN.ETH);
      const removedCollateralAmtConverted = toL2Amt(
        depositCollateralAmt,
        TS_BASE_TOKEN.DAI
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
        daiAnswer,
        ethAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newExpectedHealthFactor).to.equal(newHealthFactor);
    });
    it("Fail to repay and deposit (general case), not the loan owner", async () => {
      // user2 repay 2.5 ETH (half debt) and deposit 5000 DAI (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.ETH
      );
      const repayDebtAmt = BigNumber.from(debtAmt).div(2);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const depositCollateralAmt = BigNumber.from(collateralAmt).div(2);

      await expect(
        diamondLoan
          .connect(user2)
          .repay(loanId, depositCollateralAmt, repayDebtAmt, true, {
            value: repayDebtAmt,
          })
      ).to.be.revertedWithCustomError(diamondLoan, "SenderIsNotLoanOwner");
    });
    it("Fail to repay and deposit (general case), health factor under threshold", async () => {
      // before health factor
      const beforeHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // repay 1 ETH (20% debt) and deposit 5000 DAI (half collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.ETH
      );
      const repayDebtAmt = BigNumber.from(debtAmt).div(5);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const depositCollateralAmt = BigNumber.from(collateralAmt).div(2);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(repayDebtAmt, TS_BASE_TOKEN.ETH);
      const removedCollateralAmtConverted = toL2Amt(
        depositCollateralAmt,
        TS_BASE_TOKEN.DAI
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
        daiAnswer,
        ethAnswer,
        ltvThreshold
      );

      // check expected health factor is under threshold
      expect(expectedHealthFactor).to.lt(1000);

      await expect(
        diamondLoan
          .connect(user1)
          .repay(loanId, depositCollateralAmt, repayDebtAmt, true, {
            value: repayDebtAmt,
          })
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsUnhealthy");

      // after health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(beforeHealthFactor).to.equal(newHealthFactor);
    });
    it("Fail to repay and deposit (general case), collateral amount less than min deposit amount", async () => {
      // repay 0.001 ETH (debt) and deposit 5 DAI (collateral)
      const debtAmt = utils.parseUnits("0.001", TS_BASE_TOKEN.ETH.decimals);
      const collateralAmt = utils.parseUnits("5", TS_BASE_TOKEN.DAI.decimals);

      await expect(
        diamondLoan
          .connect(user1)
          .repay(loanId, collateralAmt, debtAmt, true, { value: debtAmt })
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidDepositAmt");
    });
  });
  describe("Repay and deposit (stable coin pairs case)", () => {
    const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
    const tsbTokenData = tsbTokensJSON.filter(
      (token) => token.underlyingAsset === "USDT"
    )[0];
    const loanData = stableCoinPairLoanDataJSON[2]; // DAI -> USDT, loan owner is user2
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let daiAnswer: BigNumber;
    let usdtAnswer: BigNumber;
    let dai: ERC20Mock;
    let usdt: ERC20Mock;

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
      const usdtRoundDataJSON = roundDataJSON[TsTokenId.USDT][0];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get dai price with 8 decimals from test oracle
      const daiPriceFeed = priceFeeds[TsTokenId.DAI];
      const daiRoundDataJSON = roundDataJSON[TsTokenId.DAI][0];
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

      // get dai contract
      dai = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.DAI]
      );

      // give user2 10000 USDT for repay test
      usdt = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      );
      const amount = utils.parseUnits("10000", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user2).mint(user2Addr, amount);

      // user2 approve to ZkTrueUp
      await usdt
        .connect(user2)
        .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    });
    it("Success to repay and deposit, fully repay and fully deposit (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // repay 80 USDT (all debt) and deposit 1000 DAI (all collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDT
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const repayAndDepositTx = await diamondLoan
        .connect(user2)
        .repay(loanId, collateralAmt, debtAmt, true);
      const repayAndDepositReceipt = await repayAndDepositTx.wait();

      // after balance
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // check balance
      expect(afterZkTrueUpDaiBalance).to.be.equal(beforeZkTrueUpDaiBalance);
      expect(
        afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)
      ).to.be.equal(debtAmt);
      expect(afterUser2DaiBalance).to.be.equal(beforeUser2DaiBalance);
      expect(beforeUser2UsdtBalance.sub(afterUser2UsdtBalance)).to.be.equal(
        debtAmt
      );

      // check event
      await expect(repayAndDepositTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user2Addr,
          dai.address,
          usdt.address,
          collateralAmt,
          debtAmt,
          true
        );
      await expect(repayAndDepositTx)
        .to.emit(diamondWithAccountLib, "Deposit")
        .withArgs(
          user2Addr,
          loan.accountId,
          loan.collateralTokenId,
          collateralAmt
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.be.equal(0);
      expect(newLoanInfo.collateralAmt).to.be.equal(0);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDT);
      const removedCollateralAmtConverted = toL2Amt(
        collateralAmt,
        TS_BASE_TOKEN.DAI
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
        daiAnswer,
        usdtAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to repay and deposit, fully repay and partial deposit (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // repay 80 USDT (all debt) and deposit 800 DAI (80% collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDT
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const depositCollateralAmt = BigNumber.from(collateralAmt).mul(4).div(5);

      const repayAndDepositTx = await diamondLoan
        .connect(user2)
        .repay(loanId, depositCollateralAmt, debtAmt, true);
      const repayAndDepositReceipt = await repayAndDepositTx.wait();

      // after balance
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // check balance
      expect(afterZkTrueUpDaiBalance).to.be.equal(beforeZkTrueUpDaiBalance);
      expect(
        afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)
      ).to.be.equal(debtAmt);
      expect(afterUser2DaiBalance).to.be.equal(beforeUser2DaiBalance);
      expect(beforeUser2UsdtBalance.sub(afterUser2UsdtBalance)).to.be.equal(
        debtAmt
      );

      // check event
      await expect(repayAndDepositTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user2Addr,
          dai.address,
          usdt.address,
          depositCollateralAmt,
          debtAmt,
          true
        );
      await expect(repayAndDepositTx)
        .to.emit(diamondWithAccountLib, "Deposit")
        .withArgs(
          user2Addr,
          loan.accountId,
          loan.collateralTokenId,
          depositCollateralAmt
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.be.equal(0);
      expect(newLoanInfo.collateralAmt).to.be.equal(
        BigNumber.from(collateralAmt).sub(depositCollateralAmt)
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDT);
      const removedCollateralAmtConverted = toL2Amt(
        depositCollateralAmt,
        TS_BASE_TOKEN.DAI
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
        daiAnswer,
        usdtAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to repay and deposit, fully repay and partial deposit twice (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // repay 80 USDT (all debt) and deposit 100 DAI (10% collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDT
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const depositCollateralAmt = BigNumber.from(collateralAmt).div(10);

      const firstRepayAndDepositTx = await diamondLoan
        .connect(user2)
        .repay(loanId, depositCollateralAmt, debtAmt, true);
      await firstRepayAndDepositTx.wait();

      // repay remaining 0 USDT (debt) and deposit remaining 900 DAI
      const secondDebtAmt = utils.parseUnits("0", TS_BASE_TOKEN.USDT.decimals);
      const secondCollateralAmt =
        BigNumber.from(collateralAmt).sub(depositCollateralAmt);

      const secondRepayAndDepositTx = await diamondLoan
        .connect(user2)
        .repay(loanId, secondCollateralAmt, secondDebtAmt, true);

      // check event
      await expect(secondRepayAndDepositTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user2Addr,
          dai.address,
          usdt.address,
          secondCollateralAmt,
          secondDebtAmt,
          true
        );
      await expect(secondRepayAndDepositTx)
        .to.emit(diamondWithAccountLib, "Deposit")
        .withArgs(
          user2Addr,
          loan.accountId,
          loan.collateralTokenId,
          secondCollateralAmt
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.be.equal(0);
      expect(newLoanInfo.collateralAmt).to.be.equal(0);

      // after balance
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // check balance
      expect(afterZkTrueUpDaiBalance).to.be.equal(beforeZkTrueUpDaiBalance);
      expect(
        afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)
      ).to.be.equal(debtAmt);
      expect(afterUser2DaiBalance).to.be.equal(beforeUser2DaiBalance);
      expect(beforeUser2UsdtBalance.sub(afterUser2UsdtBalance)).to.be.equal(
        debtAmt
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDT);
      const removedCollateralAmtConverted = toL2Amt(
        depositCollateralAmt,
        TS_BASE_TOKEN.DAI
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
        daiAnswer,
        usdtAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to repay and deposit, partial repay and partial deposit (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // repay 30 USDT (3/8 debt) and deposit 100 DAI (10% collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDT
      );
      const repayDebtAmt = BigNumber.from(debtAmt).mul(3).div(8);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const depositCollateralAmt = BigNumber.from(collateralAmt).div(10);

      const repayAndDepositTx = await diamondLoan
        .connect(user2)
        .repay(loanId, depositCollateralAmt, repayDebtAmt, true);
      const repayAndDepositReceipt = await repayAndDepositTx.wait();

      // after balance
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // check balance
      expect(afterZkTrueUpDaiBalance).to.be.equal(beforeZkTrueUpDaiBalance);
      expect(
        afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)
      ).to.be.equal(repayDebtAmt);
      expect(afterUser2DaiBalance).to.be.equal(beforeUser2DaiBalance);
      expect(beforeUser2UsdtBalance.sub(afterUser2UsdtBalance)).to.be.equal(
        repayDebtAmt
      );

      // check event
      await expect(repayAndDepositTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user2Addr,
          dai.address,
          usdt.address,
          depositCollateralAmt,
          repayDebtAmt,
          true
        );
      await expect(repayAndDepositTx)
        .to.emit(diamondWithAccountLib, "Deposit")
        .withArgs(
          user2Addr,
          loan.accountId,
          loan.collateralTokenId,
          depositCollateralAmt
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(
        BigNumber.from(debtAmt).sub(repayDebtAmt)
      );
      expect(newLoanInfo.collateralAmt).to.equal(
        BigNumber.from(collateralAmt).sub(depositCollateralAmt)
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(repayDebtAmt, TS_BASE_TOKEN.USDT);
      const removedCollateralAmtConverted = toL2Amt(
        depositCollateralAmt,
        TS_BASE_TOKEN.DAI
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
        daiAnswer,
        usdtAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to repay and deposit, partial repay twice and partial deposit twice (stable coin pairs case)", async () => {
      // before balance
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUser2DaiBalance = await dai.balanceOf(user2Addr);
      const beforeUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // repay 30 USDT (3/8 debt) and deposit 100 DAI (10% collateral)
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDT
      );
      const firstRepayDebtAmt = BigNumber.from(debtAmt).mul(3).div(8);
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );
      const depositCollateralAmt = BigNumber.from(collateralAmt).div(10);

      const firstRepayAndDepositTx = await diamondLoan
        .connect(user2)
        .repay(loanId, depositCollateralAmt, firstRepayDebtAmt, true);
      await firstRepayAndDepositTx.wait();

      // repay remaining 50 USDT (debt) and deposit remaining 900 DAI (collateral)
      const secondDebtAmt = BigNumber.from(debtAmt).sub(firstRepayDebtAmt);
      const secondCollateralAmt =
        BigNumber.from(collateralAmt).sub(depositCollateralAmt);

      const secondRepayAndDepositTx = await diamondLoan
        .connect(user2)
        .repay(loanId, secondCollateralAmt, secondDebtAmt, true);

      // check event
      await expect(secondRepayAndDepositTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user2Addr,
          dai.address,
          usdt.address,
          secondCollateralAmt,
          secondDebtAmt,
          true
        );
      await expect(secondRepayAndDepositTx)
        .to.emit(diamondWithAccountLib, "Deposit")
        .withArgs(
          user2Addr,
          loan.accountId,
          loan.collateralTokenId,
          secondCollateralAmt
        );

      // check new loan data
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.debtAmt).to.equal(0);
      expect(newLoanInfo.collateralAmt).to.equal(0);

      // after balance
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUser2DaiBalance = await dai.balanceOf(user2Addr);
      const afterUser2UsdtBalance = await usdt.balanceOf(user2Addr);

      // check balance
      const totalDebtAmt = firstRepayDebtAmt.add(secondDebtAmt);
      const totalCollateralAmt = depositCollateralAmt.add(secondCollateralAmt);
      expect(afterZkTrueUpDaiBalance).to.be.equal(beforeZkTrueUpDaiBalance);
      expect(
        afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)
      ).to.be.equal(totalDebtAmt);
      expect(afterUser2DaiBalance).to.be.equal(beforeUser2DaiBalance);
      expect(beforeUser2UsdtBalance.sub(afterUser2UsdtBalance)).to.be.equal(
        totalDebtAmt
      );

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(totalDebtAmt, TS_BASE_TOKEN.USDT);
      const removedCollateralAmtConverted = toL2Amt(
        totalCollateralAmt,
        TS_BASE_TOKEN.DAI
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
        daiAnswer,
        usdtAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Fail to repay and deposit (stable coin pair), health factor under threshold", async () => {
      // repay 0 USDT (debt) and take 999 DAI (collateral)
      const debtAmt = utils.parseUnits("0", TS_BASE_TOKEN.USDT.decimals);
      const collateralAmt = utils.parseUnits("999", TS_BASE_TOKEN.DAI.decimals);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDT);
      const removedCollateralAmtConverted = toL2Amt(
        collateralAmt,
        TS_BASE_TOKEN.DAI
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
        daiAnswer,
        usdtAnswer,
        ltvThreshold
      );

      // check health factor under threshold
      expect(newExpectedHealthFactor).to.lt(1000);

      // check revert
      await expect(
        diamondLoan.connect(user2).repay(loanId, collateralAmt, debtAmt, true)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsUnhealthy");
    });
  });
});

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
const helpers = require("@nomicfoundation/hardhat-network-helpers");
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract, Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { register } from "../../utils/register";
import { BaseTokenAddresses, LoanData } from "../../../utils/type";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { loanDataJSON, stableCoinPairLoanDataJSON } from "../../data/loanData";
import { toL1Amt, toL2Amt } from "../../utils/amountConvertor";
import { getExpectedHealthFactor } from "../../utils/getHealthFactor";
import {
  createAndWhiteListTsbToken,
  whiteListBaseTokens,
} from "../../utils/whitelistToken";
import {
  AccountFacet,
  AggregatorV3Interface,
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
import { MAINNET_ADDRESS } from "../../../utils/config";
import { useChainlink } from "../../../utils/useChainlink";
import { getRandomUint256 } from "../../utils/helper";

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
  const res = await deployAndInit(FACET_NAMES_MOCK, true);
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

describe("Roll to Aave", () => {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let admin: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondLoan: LoanFacet;
  let diamondRollupMock: RollupMock;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let chainlinkAggregator: AggregatorV3Interface;
  let aaveV3PoolDataProvider: Contract;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    operator = res.operator;
    admin = res.admin;
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
    aaveV3PoolDataProvider = await ethers.getContractAt(
      "contracts/test/aaveV3/IPoolDataProvider.sol:IPoolDataProvider",
      MAINNET_ADDRESS.AAVE_V3_POOL_DATA_PROVIDER
    );
    await diamondLoan.connect(admin).setIsActivatedRoll(true);
  });

  describe("Roll to Aave (general case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const tsbTokenData = tsbTokensJSON.filter(
      (token) => token.underlyingAsset === "USDC"
    )[0];
    // collateral: 1 ETH, debt: 500 USDC
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

      // register by ETH
      const registerAmt = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
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

      usdc = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDC]
      )) as ERC20Mock;

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );
    });
    it("Fail roll to Aave, sender is not loan owner", async () => {
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      await expect(
        diamondLoan.connect(user2).rollToAave(loanId, collateralAmt, debtAmt)
      ).to.be.revertedWithCustomError(diamondLoan, "SenderIsNotLoanOwner");
    });
    it("Fail roll to Aave, roll function is not activated", async () => {
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      await diamondLoan.connect(admin).setIsActivatedRoll(false);

      await expect(
        diamondLoan.connect(user2).rollToAave(loanId, collateralAmt, debtAmt)
      ).to.be.revertedWithCustomError(diamondLoan, "RollIsNotActivated");
    });
    it("Fail roll to Aave, partial roll make the origin loan unhealthy", async () => {
      // only roll 20% debt (100 USDC) to Aave
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt).div(5),
        TS_BASE_TOKEN.USDC
      );

      // 1 ETH
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      await expect(
        diamondLoan.connect(user1).rollToAave(loanId, collateralAmt, debtAmt)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsUnhealthy");
    });
    it("Fail roll to Aave, partial roll make LTV in Aave too high and borrow from Aave fail", async () => {
      // 500 USDC
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );

      // only roll 20% collateral (0.2 ETH) to Aave
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt).div(5),
        TS_BASE_TOKEN.ETH
      );

      await expect(
        diamondLoan.connect(user1).rollToAave(loanId, collateralAmt, debtAmt)
      ).to.be.revertedWithCustomError(diamondLoan, "BorrowFromAaveFailed");
    });
    it("Success roll to Aave, roll total loan to Aave", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1WethBalance = await weth.balanceOf(user1Addr);
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const [beforeUser1AWethBalance, , , , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          weth.address,
          user1Addr
        );
      const [, , beforeUser1AUsdcVariableDebt, , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          usdc.address,
          user1Addr
        );

      // 500 USDC
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );

      // 1 ETH
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      const [, , variableDebtTokenAddress] =
        await aaveV3PoolDataProvider.getReserveTokensAddresses(usdc.address);

      const debtToken = await ethers.getContractAt(
        "ICreditDelegationToken",
        variableDebtTokenAddress
      );
      const approveDelegationTx = await debtToken
        .connect(user1)
        .approveDelegation(zkTrueUp.address, debtAmt);
      const approveDelegationReceipt = await approveDelegationTx.wait();

      const approveDelegationGas = BigNumber.from(
        approveDelegationReceipt.gasUsed
      ).mul(approveDelegationReceipt.effectiveGasPrice);

      const rollToAaveTx = await diamondLoan
        .connect(user1)
        .rollToAave(loanId, collateralAmt, debtAmt);
      const rollToAaveReceipt = await rollToAaveTx.wait();

      const rollToAaveGas = BigNumber.from(rollToAaveReceipt.gasUsed).mul(
        rollToAaveReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1WethBalance = await weth.balanceOf(user1Addr);
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const [afterUser1AWethBalance, , , , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          weth.address,
          user1Addr
        );
      const [, , afterUser1AUsdcVariableDebt, , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          usdc.address,
          user1Addr
        );

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.eq(
        collateralAmt
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        debtAmt
      );
      expect(beforeUser1UsdcBalance).to.eq(afterUser1UsdcBalance);
      expect(
        beforeUser1EthBalance.sub(approveDelegationGas).sub(rollToAaveGas)
      ).to.eq(afterUser1EthBalance);
      expect(beforeUser1WethBalance).to.eq(afterUser1WethBalance);
      // check Aave status
      expect(beforeUser1AWethBalance.add(collateralAmt)).to.eq(
        afterUser1AWethBalance
      );
      expect(beforeUser1AUsdcVariableDebt.add(debtAmt)).to.eq(
        afterUser1AUsdcVariableDebt
      );

      // check event
      await expect(rollToAaveTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user1Addr,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          collateralAmt,
          debtAmt,
          false
        );

      await expect(rollToAaveTx)
        .to.emit(diamondLoan, "RollToAave")
        .withArgs(
          loanId,
          user1Addr,
          weth.address,
          usdc.address,
          collateralAmt,
          debtAmt
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
      chainlinkAggregator = await useChainlink(MAINNET_ADDRESS.ETH_PRICE_FEED);
      ethAnswer = (await chainlinkAggregator.latestRoundData()).answer;

      chainlinkAggregator = await useChainlink(MAINNET_ADDRESS.USDC_PRICE_FEED);
      usdcAnswer = (await chainlinkAggregator.latestRoundData()).answer;

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
    it("Success roll to Aave, roll partial loan to Aave", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser1WethBalance = await weth.balanceOf(user1Addr);
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const [beforeUser1AWethBalance, , , , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          weth.address,
          user1Addr
        );
      const [, , beforeUser1AUsdcVariableDebt, , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          usdc.address,
          user1Addr
        );

      // 250 USDC
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt).div(2),
        TS_BASE_TOKEN.USDC
      );
      // 0.5 ETH
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt).div(2),
        TS_BASE_TOKEN.ETH
      );

      const [, , variableDebtTokenAddress] =
        await aaveV3PoolDataProvider.getReserveTokensAddresses(usdc.address);

      const debtToken = await ethers.getContractAt(
        "ICreditDelegationToken",
        variableDebtTokenAddress
      );
      const approveDelegationTx = await debtToken
        .connect(user1)
        .approveDelegation(zkTrueUp.address, debtAmt);
      const approveDelegationReceipt = await approveDelegationTx.wait();

      const approveDelegationGas = BigNumber.from(
        approveDelegationReceipt.gasUsed
      ).mul(approveDelegationReceipt.effectiveGasPrice);

      const rollToAaveTx = await diamondLoan
        .connect(user1)
        .rollToAave(loanId, collateralAmt, debtAmt);
      const rollToAaveReceipt = await rollToAaveTx.wait();

      const rollToAaveGas = BigNumber.from(rollToAaveReceipt.gasUsed).mul(
        rollToAaveReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser1WethBalance = await weth.balanceOf(user1Addr);
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const [afterUser1AWethBalance, , , , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          weth.address,
          user1Addr
        );
      const [, , afterUser1AUsdcVariableDebt, , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          usdc.address,
          user1Addr
        );

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.eq(
        collateralAmt
      );
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        debtAmt
      );
      expect(beforeUser1UsdcBalance).to.eq(afterUser1UsdcBalance);
      expect(
        beforeUser1EthBalance.sub(approveDelegationGas).sub(rollToAaveGas)
      ).to.eq(afterUser1EthBalance);
      expect(beforeUser1WethBalance).to.eq(afterUser1WethBalance);
      // check Aave status
      expect(beforeUser1AWethBalance.add(collateralAmt)).to.eq(
        afterUser1AWethBalance
      );
      expect(beforeUser1AUsdcVariableDebt.add(debtAmt)).to.eq(
        afterUser1AUsdcVariableDebt
      );

      // check event
      await expect(rollToAaveTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          user1Addr,
          DEFAULT_ETH_ADDRESS,
          usdc.address,
          collateralAmt,
          debtAmt,
          false
        );

      await expect(rollToAaveTx)
        .to.emit(diamondLoan, "RollToAave")
        .withArgs(
          loanId,
          user1Addr,
          weth.address,
          usdc.address,
          collateralAmt,
          debtAmt
        );

      /// check loan data after repay
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.collateralAmt).to.eq(collateralAmt);
      expect(newLoanInfo.debtAmt).to.eq(debtAmt);

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
      chainlinkAggregator = await useChainlink(MAINNET_ADDRESS.ETH_PRICE_FEED);
      ethAnswer = (await chainlinkAggregator.latestRoundData()).answer;

      chainlinkAggregator = await useChainlink(MAINNET_ADDRESS.USDC_PRICE_FEED);
      usdcAnswer = (await chainlinkAggregator.latestRoundData()).answer;

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
      expect(newHealthFactor).to.gt(1000);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
  });
  describe("Roll to Aave (USDT case)", () => {
    const tsbTokenData = tsbTokensJSON.filter(
      (token) => token.underlyingAsset === "USDC"
    )[0];
    // collateral: 100 USDT, debt: 90 USDC
    const loanData = stableCoinPairLoanDataJSON[0]; // USDT -> USDC
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let usdt: ERC20Mock;
    let impersonatedSigner: Signer;

    beforeEach(async () => {
      // mock mainnet address who have some USDT
      const mockAddress = "0xCE2676C927d1E4850803814B9C94C451bc84aBD2";
      await helpers.impersonateAccount(mockAddress);
      impersonatedSigner = await ethers.getSigner(mockAddress);

      // tsb USDC
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsb,
        operator,
        tsbTokenData
      );

      usdt = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      )) as ERC20Mock;

      // register by ETH
      const registerAmt1 = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      // register default user1
      await register(
        user1,
        Number(TsTokenId.ETH),
        registerAmt1,
        baseTokenAddresses,
        diamondAcc
      );

      const registerAmt2 = utils.parseUnits(
        "1000",
        TS_BASE_TOKEN.USDT.decimals
      );

      await (
        await usdt
          .connect(impersonatedSigner)
          .approve(diamondAcc.address, registerAmt2)
      ).wait();
      // register user2 for loan owner
      const pubKey = { X: getRandomUint256(), Y: getRandomUint256() };
      await (
        await diamondAcc
          .connect(impersonatedSigner)
          .register(pubKey.X, pubKey.Y, usdt.address, registerAmt2)
      ).wait();

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
    });
    it("Fail roll to Aave, Aave not support USDT as collateral to borrow", async () => {
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.USDT
      );

      await expect(
        diamondLoan
          .connect(impersonatedSigner)
          .rollToAave(loanId, collateralAmt, debtAmt)
      ).to.be.revertedWithCustomError(diamondLoan, "BorrowFromAaveFailed");
    });
  });
  describe("Roll to Aave (stable coin pairs loan case)", () => {
    const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
    const tsbTokenData = tsbTokensJSON.filter(
      (token) => token.underlyingAsset === "USDT"
    )[0];
    // collateral: 1000 DAI, debt: 80 USDT
    const loanData = stableCoinPairLoanDataJSON[2]; // DAI -> USDT
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let dai: ERC20Mock;
    let usdt: ERC20Mock;
    let daiAnswer: BigNumber;
    let usdtAnswer: BigNumber;
    let impersonatedSigner: Signer;
    let impersonatedSignerAddr: string;

    beforeEach(async () => {
      // mock mainnet address who have some DAI
      const mockAddress = "0x5c59353A153DD21E0bd1efaAC37A8fB18A70E827";
      await helpers.impersonateAccount(mockAddress);
      impersonatedSigner = await ethers.getSigner(mockAddress);
      impersonatedSignerAddr = await impersonatedSigner.getAddress();

      // tsb USDT
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsb,
        operator,
        tsbTokenData
      );

      dai = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.DAI]
      )) as ERC20Mock;
      usdt = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      )) as ERC20Mock;

      // register by ETH
      const registerAmt1 = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      // register default user1
      await register(
        user1,
        Number(TsTokenId.ETH),
        registerAmt1,
        baseTokenAddresses,
        diamondAcc
      );

      const registerAmt2 = utils.parseUnits("1000", TS_BASE_TOKEN.DAI.decimals);
      await (
        await dai
          .connect(impersonatedSigner)
          .approve(diamondAcc.address, registerAmt2)
      ).wait();
      // register impersonatedSigner for loan owner
      const pubKey = { X: getRandomUint256(), Y: getRandomUint256() };
      await (
        await diamondAcc
          .connect(impersonatedSigner)
          .register(pubKey.X, pubKey.Y, dai.address, registerAmt2)
      ).wait();

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
    });
    it("Fail roll to Aave, partial roll make LTV in Aave too high and borrow from Aave fail", async () => {
      // 80 USDT
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDT
      );

      // 100 DAI (10% of total collateral DAI, but DAI LTV ration is 77% in Aave)
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt).div(10),
        TS_BASE_TOKEN.DAI
      );

      const [, , variableDebtTokenAddress] =
        await aaveV3PoolDataProvider.getReserveTokensAddresses(usdt.address);

      const debtToken = await ethers.getContractAt(
        "ICreditDelegationToken",
        variableDebtTokenAddress
      );
      const approveDelegationTx = await debtToken
        .connect(impersonatedSigner)
        .approveDelegation(zkTrueUp.address, debtAmt);
      const approveDelegationReceipt = await approveDelegationTx.wait();

      await expect(
        diamondLoan
          .connect(impersonatedSigner)
          .rollToAave(loanId, collateralAmt, debtAmt)
      ).to.be.revertedWithCustomError(diamondLoan, "BorrowFromAaveFailed");
    });
    it("Success roll to Aave, roll total loan to Aave ", async () => {
      // before balance
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUserDaiBalance = await dai.balanceOf(impersonatedSignerAddr);
      const beforeUserUsdtBalance = await usdt.balanceOf(
        impersonatedSignerAddr
      );
      const [beforeUserADaiBalance, , , , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          dai.address,
          impersonatedSignerAddr
        );
      const [, , beforeUserAUsdtVariableDebt, , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          usdt.address,
          impersonatedSignerAddr
        );

      // 80 USDT
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDT
      );

      // 1000 DAI
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      );

      const [, , variableDebtTokenAddress] =
        await aaveV3PoolDataProvider.getReserveTokensAddresses(usdt.address);

      const debtToken = await ethers.getContractAt(
        "ICreditDelegationToken",
        variableDebtTokenAddress
      );
      const approveDelegationTx = await debtToken
        .connect(impersonatedSigner)
        .approveDelegation(zkTrueUp.address, debtAmt);
      const approveDelegationReceipt = await approveDelegationTx.wait();

      const rollToAaveTx = await diamondLoan
        .connect(impersonatedSigner)
        .rollToAave(loanId, collateralAmt, debtAmt);
      const rollToAaveReceipt = await rollToAaveTx.wait();

      // after balance
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUserDaiBalance = await dai.balanceOf(impersonatedSignerAddr);
      const afterUserUsdtBalance = await usdt.balanceOf(impersonatedSignerAddr);
      const [afterUserADaiBalance, , , , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          dai.address,
          impersonatedSignerAddr
        );
      const [, , afterUserAUsdtVariableDebt, , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          usdt.address,
          impersonatedSignerAddr
        );

      // check balance
      expect(beforeZkTrueUpDaiBalance.sub(afterZkTrueUpDaiBalance)).to.eq(
        collateralAmt
      );
      expect(afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)).to.eq(
        debtAmt
      );
      expect(beforeUserDaiBalance).to.eq(afterUserDaiBalance);
      expect(beforeUserUsdtBalance).to.eq(afterUserUsdtBalance);
      // check Aave status
      expect(beforeUserADaiBalance.add(collateralAmt)).to.eq(
        afterUserADaiBalance
      );
      expect(beforeUserAUsdtVariableDebt.add(debtAmt)).to.eq(
        afterUserAUsdtVariableDebt
      );

      // check event
      await expect(rollToAaveTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          impersonatedSignerAddr,
          dai.address,
          usdt.address,
          collateralAmt,
          debtAmt,
          false
        );

      await expect(rollToAaveTx)
        .to.emit(diamondLoan, "RollToAave")
        .withArgs(
          loanId,
          impersonatedSignerAddr,
          dai.address,
          usdt.address,
          collateralAmt,
          debtAmt
        );

      /// check loan data after repay
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      expect(newLoanInfo.collateralAmt).to.eq(0);
      expect(newLoanInfo.debtAmt).to.eq(0);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDT);

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

      // get new expected health factor
      chainlinkAggregator = await useChainlink(MAINNET_ADDRESS.DAI_PRICE_FEED);
      daiAnswer = (await chainlinkAggregator.latestRoundData()).answer;

      chainlinkAggregator = await useChainlink(MAINNET_ADDRESS.USDT_PRICE_FEED);
      usdtAnswer = (await chainlinkAggregator.latestRoundData()).answer;

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

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success roll to Aave, roll partial loan to Aave ", async () => {
      // before balance
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUserDaiBalance = await dai.balanceOf(impersonatedSignerAddr);
      const beforeUserUsdtBalance = await usdt.balanceOf(
        impersonatedSignerAddr
      );
      const [beforeUserADaiBalance, , , , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          dai.address,
          impersonatedSignerAddr
        );
      const [, , beforeUserAUsdtVariableDebt, , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          usdt.address,
          impersonatedSignerAddr
        );

      // 80 USDT
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDT
      );

      // 200 DAI (20% of total collateral DAI)
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt).div(5),
        TS_BASE_TOKEN.DAI
      );

      const [, , variableDebtTokenAddress] =
        await aaveV3PoolDataProvider.getReserveTokensAddresses(usdt.address);

      const debtToken = await ethers.getContractAt(
        "ICreditDelegationToken",
        variableDebtTokenAddress
      );
      const approveDelegationTx = await debtToken
        .connect(impersonatedSigner)
        .approveDelegation(zkTrueUp.address, debtAmt);
      const approveDelegationReceipt = await approveDelegationTx.wait();

      const rollToAaveTx = await diamondLoan
        .connect(impersonatedSigner)
        .rollToAave(loanId, collateralAmt, debtAmt);
      const rollToAaveReceipt = await rollToAaveTx.wait();

      // after balance
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUserDaiBalance = await dai.balanceOf(impersonatedSignerAddr);
      const afterUserUsdtBalance = await usdt.balanceOf(impersonatedSignerAddr);
      const [afterUserADaiBalance, , , , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          dai.address,
          impersonatedSignerAddr
        );
      const [, , afterUserAUsdtVariableDebt, , , , , ,] =
        await aaveV3PoolDataProvider.getUserReserveData(
          usdt.address,
          impersonatedSignerAddr
        );

      // check balance
      expect(beforeZkTrueUpDaiBalance.sub(afterZkTrueUpDaiBalance)).to.eq(
        collateralAmt
      );
      expect(afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)).to.eq(
        debtAmt
      );
      expect(beforeUserDaiBalance).to.eq(afterUserDaiBalance);
      expect(beforeUserUsdtBalance).to.eq(afterUserUsdtBalance);
      // check Aave status
      expect(beforeUserADaiBalance.add(collateralAmt)).to.eq(
        afterUserADaiBalance
      );
      expect(beforeUserAUsdtVariableDebt.add(debtAmt)).to.eq(
        afterUserAUsdtVariableDebt
      );

      // check event
      await expect(rollToAaveTx)
        .to.emit(diamondLoan, "Repay")
        .withArgs(
          loanId,
          impersonatedSignerAddr,
          dai.address,
          usdt.address,
          collateralAmt,
          debtAmt,
          false
        );

      await expect(rollToAaveTx)
        .to.emit(diamondLoan, "RollToAave")
        .withArgs(
          loanId,
          impersonatedSignerAddr,
          dai.address,
          usdt.address,
          collateralAmt,
          debtAmt
        );

      /// check loan data after repay
      const newLoanInfo = await diamondLoan.getLoan(loanId);
      const remainingCollateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.DAI
      ).sub(collateralAmt);
      expect(newLoanInfo.collateralAmt).to.eq(remainingCollateralAmt);
      expect(newLoanInfo.debtAmt).to.eq(0);

      // convert amount to 8 decimals for loan data
      const repaidDebtAmtConverted = toL2Amt(debtAmt, TS_BASE_TOKEN.USDT);

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

      // get new expected health factor
      chainlinkAggregator = await useChainlink(MAINNET_ADDRESS.DAI_PRICE_FEED);
      daiAnswer = (await chainlinkAggregator.latestRoundData()).answer;

      chainlinkAggregator = await useChainlink(MAINNET_ADDRESS.USDT_PRICE_FEED);
      usdtAnswer = (await chainlinkAggregator.latestRoundData()).answer;

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

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
  });
});

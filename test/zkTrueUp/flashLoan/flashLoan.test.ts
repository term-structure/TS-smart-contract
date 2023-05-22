import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { register } from "../../utils/register";
import { BaseTokenAddresses, LoanData, PriceFeeds } from "../../../utils/type";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { loanDataJSON } from "../../data/loanData";
import { updateRoundData } from "../../utils/updateRoundData";
import {
  getLiquidatorRewardAmt,
  getProtocolPenaltyAmt,
  toL1Amt,
} from "../../utils/amountConvertor";
import {
  createAndWhiteListTsbToken,
  whiteListBaseTokens,
} from "../../utils/whitelistToken";
import {
  AccountFacet,
  ERC20Mock,
  FlashLoanBase,
  FlashLoanFacet,
  FlashLoanToLiquidation,
  LoanFacet,
  RollupMock,
  TokenFacet,
  TsbFacet,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  LIQUIDATION_FACTOR,
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
    res.zkTrueUp
  )) as TokenFacet;
  await whiteListBaseTokens(
    res.baseTokenAddresses,
    res.priceFeeds,
    diamondToken,
    res.operator
  );
  return res;
};

describe("Flash loan", () => {
  let [user1]: Signer[] = [];
  let [user1Addr]: string[] = [];
  let treasuryAddr: string;
  let admin: Signer;
  let operator: Signer;
  let liquidator: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondFlashLoan: FlashLoanFacet;
  let diamondLoan: LoanFacet;
  let diamondRollupMock: RollupMock;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let priceFeeds: PriceFeeds;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1, liquidator] = await ethers.getSigners();
    [user1Addr] = await Promise.all([user1.getAddress()]);
    treasuryAddr = res.treasury.address;
    admin = res.admin;
    operator = res.operator;
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUp)) as AccountFacet;
    diamondFlashLoan = (await useFacet(
      "FlashLoanFacet",
      zkTrueUp
    )) as FlashLoanFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUp)) as LoanFacet;
    diamondRollupMock = (await useFacet("RollupMock", zkTrueUp)) as RollupMock;
    diamondToken = (await useFacet("TokenFacet", zkTrueUp)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUp)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    priceFeeds = res.priceFeeds;
  });

  describe("Flash loan but do nothing", () => {
    let wbtc: ERC20Mock;
    let usdt: ERC20Mock;
    let usdc: ERC20Mock;
    let dai: ERC20Mock;
    let flashLoanBase: FlashLoanBase;
    let wethAmt: BigNumber;
    let wbtcAmt: BigNumber;
    let usdtAmt: BigNumber;
    let usdcAmt: BigNumber;
    let daiAmt: BigNumber;
    let wethPremiumAmt: BigNumber;
    let wbtcPremiumAmt: BigNumber;
    let usdtPremiumAmt: BigNumber;
    let usdcPremiumAmt: BigNumber;
    let daiPremiumAmt: BigNumber;

    beforeEach(async () => {
      // deploy flashLoanBase
      const FlashLoanBase = await ethers.getContractFactory("FlashLoanBase");
      flashLoanBase = (await FlashLoanBase.connect(user1).deploy(
        zkTrueUp.address
      )) as FlashLoanBase;
      await flashLoanBase.deployed();

      usdc = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDC]
      );
      wbtc = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.WBTC]
      );
      usdt = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      );
      dai = await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.DAI]
      );

      // mint 100 token and transfer to zkTrueUp as default token amount
      wethAmt = utils.parseUnits("100", TS_BASE_TOKEN.ETH.decimals);
      wbtcAmt = utils.parseUnits("100", TS_BASE_TOKEN.WBTC.decimals);
      usdcAmt = utils.parseUnits("100", TS_BASE_TOKEN.USDC.decimals);
      usdtAmt = utils.parseUnits("100", TS_BASE_TOKEN.USDT.decimals);
      daiAmt = utils.parseUnits("100", TS_BASE_TOKEN.DAI.decimals);
      await weth.connect(user1).deposit({ value: wethAmt });
      await weth.connect(user1).transfer(zkTrueUp.address, wethAmt);
      await wbtc.connect(user1).mint(zkTrueUp.address, wbtcAmt);
      await usdc.connect(user1).mint(zkTrueUp.address, usdcAmt);
      await usdt.connect(user1).mint(zkTrueUp.address, usdtAmt);
      await dai.connect(user1).mint(zkTrueUp.address, daiAmt);

      // mint 0.03 token (flash loan premium) and transfer to flashLoanBase
      wethPremiumAmt = utils.parseUnits("0.03", TS_BASE_TOKEN.ETH.decimals);
      wbtcPremiumAmt = utils.parseUnits("0.03", TS_BASE_TOKEN.WBTC.decimals);
      usdcPremiumAmt = utils.parseUnits("0.03", TS_BASE_TOKEN.USDC.decimals);
      usdtPremiumAmt = utils.parseUnits("0.03", TS_BASE_TOKEN.USDT.decimals);
      daiPremiumAmt = utils.parseUnits("0.03", TS_BASE_TOKEN.DAI.decimals);
      await weth.connect(user1).deposit({ value: wethPremiumAmt });
      await weth.connect(user1).transfer(flashLoanBase.address, wethPremiumAmt);
      await wbtc.connect(user1).mint(flashLoanBase.address, wbtcPremiumAmt);
      await usdc.connect(user1).mint(flashLoanBase.address, usdcPremiumAmt);
      await usdt.connect(user1).mint(flashLoanBase.address, usdtPremiumAmt);
      await dai.connect(user1).mint(flashLoanBase.address, daiPremiumAmt);
    });

    it("Success to execute flash loan and do nothing (1 token)", async () => {
      // before balance
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeFlashLoanBaseUsdcBalance = await usdc.balanceOf(
        flashLoanBase.address
      );
      const beforeTreasuryUsdcBalance = await usdc.balanceOf(treasuryAddr);
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // execute flash loan
      const flashLoanTx = await flashLoanBase
        .connect(user1)
        .flashLoanCall([usdc.address], [usdcAmt]);
      const flashLoanReceipt = await flashLoanTx.wait();

      // after balance
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterFlashLoanBaseUsdcBalance = await usdc.balanceOf(
        flashLoanBase.address
      );
      const afterTreasuryUsdcBalance = await usdc.balanceOf(treasuryAddr);
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);

      // check balance
      expect(beforeZkTrueUpUsdcBalance).to.eq(afterZkTrueUpUsdcBalance);
      expect(
        beforeFlashLoanBaseUsdcBalance.sub(afterFlashLoanBaseUsdcBalance)
      ).to.eq(usdcPremiumAmt);
      expect(afterTreasuryUsdcBalance.sub(beforeTreasuryUsdcBalance)).to.eq(
        usdcPremiumAmt
      );
      expect(beforeUser1UsdcBalance).to.eq(afterUser1UsdcBalance);

      // check event
      await expect(flashLoanTx)
        .to.emit(diamondFlashLoan, "FlashLoan")
        .withArgs(
          flashLoanBase.address,
          flashLoanBase.address,
          usdc.address,
          usdcAmt,
          usdcPremiumAmt
        );
    });
    it("Success to execute flash loan and do nothing (multi token)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpWbtcBalance = await wbtc.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const beforeFlashLoanBaseWethBalance = await weth.balanceOf(
        flashLoanBase.address
      );
      const beforeFlashLoanBaseWbtcBalance = await wbtc.balanceOf(
        flashLoanBase.address
      );
      const beforeFlashLoanBaseUsdcBalance = await usdc.balanceOf(
        flashLoanBase.address
      );
      const beforeFlashLoanBaseUsdtBalance = await usdt.balanceOf(
        flashLoanBase.address
      );
      const beforeFlashLoanBaseDaiBalance = await dai.balanceOf(
        flashLoanBase.address
      );
      const beforeTreasuryWethBalance = await weth.balanceOf(treasuryAddr);
      const beforeTreasuryWbtcBalance = await wbtc.balanceOf(treasuryAddr);
      const beforeTreasuryUsdcBalance = await usdc.balanceOf(treasuryAddr);
      const beforeTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const beforeTreasuryDaiBalance = await dai.balanceOf(treasuryAddr);

      // execute flash loan
      const assets = [
        weth.address,
        wbtc.address,
        usdc.address,
        usdt.address,
        dai.address,
      ];
      const amounts = [wethAmt, wbtcAmt, usdcAmt, usdtAmt, daiAmt];
      const flashLoanTx = await flashLoanBase
        .connect(user1)
        .flashLoanCall(assets, amounts);
      const flashLoanReceipt = await flashLoanTx.wait();

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterZkTrueUpWbtcBalance = await wbtc.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterZkTrueUpDaiBalance = await dai.balanceOf(zkTrueUp.address);
      const afterFlashLoanBaseWethBalance = await weth.balanceOf(
        flashLoanBase.address
      );
      const afterFlashLoanBaseWbtcBalance = await wbtc.balanceOf(
        flashLoanBase.address
      );
      const afterFlashLoanBaseUsdcBalance = await usdc.balanceOf(
        flashLoanBase.address
      );
      const afterFlashLoanBaseUsdtBalance = await usdt.balanceOf(
        flashLoanBase.address
      );
      const afterFlashLoanBaseDaiBalance = await dai.balanceOf(
        flashLoanBase.address
      );
      const afterTreasuryWethBalance = await weth.balanceOf(treasuryAddr);
      const afterTreasuryWbtcBalance = await wbtc.balanceOf(treasuryAddr);
      const afterTreasuryUsdcBalance = await usdc.balanceOf(treasuryAddr);
      const afterTreasuryUsdtBalance = await usdt.balanceOf(treasuryAddr);
      const afterTreasuryDaiBalance = await dai.balanceOf(treasuryAddr);

      // check balance
      expect(beforeZkTrueUpWethBalance).to.eq(afterZkTrueUpWethBalance);
      expect(beforeZkTrueUpWbtcBalance).to.eq(afterZkTrueUpWbtcBalance);
      expect(beforeZkTrueUpUsdcBalance).to.eq(afterZkTrueUpUsdcBalance);
      expect(beforeZkTrueUpUsdtBalance).to.eq(afterZkTrueUpUsdtBalance);
      expect(beforeZkTrueUpDaiBalance).to.eq(afterZkTrueUpDaiBalance);
      expect(
        beforeFlashLoanBaseWethBalance.sub(afterFlashLoanBaseWethBalance)
      ).to.eq(wethPremiumAmt);
      expect(
        beforeFlashLoanBaseWbtcBalance.sub(afterFlashLoanBaseWbtcBalance)
      ).to.eq(wbtcPremiumAmt);
      expect(
        beforeFlashLoanBaseUsdcBalance.sub(afterFlashLoanBaseUsdcBalance)
      ).to.eq(usdcPremiumAmt);
      expect(
        beforeFlashLoanBaseUsdtBalance.sub(afterFlashLoanBaseUsdtBalance)
      ).to.eq(usdtPremiumAmt);
      expect(
        beforeFlashLoanBaseDaiBalance.sub(afterFlashLoanBaseDaiBalance)
      ).to.eq(daiPremiumAmt);
      expect(afterTreasuryWethBalance.sub(beforeTreasuryWethBalance)).to.eq(
        wethPremiumAmt
      );
      expect(afterTreasuryWbtcBalance.sub(beforeTreasuryWbtcBalance)).to.eq(
        wbtcPremiumAmt
      );
      expect(afterTreasuryUsdcBalance.sub(beforeTreasuryUsdcBalance)).to.eq(
        usdcPremiumAmt
      );
      expect(afterTreasuryUsdtBalance.sub(beforeTreasuryUsdtBalance)).to.eq(
        usdtPremiumAmt
      );
      expect(afterTreasuryDaiBalance.sub(beforeTreasuryDaiBalance)).to.eq(
        daiPremiumAmt
      );

      // check event
      await expect(flashLoanTx)
        .to.emit(diamondFlashLoan, "FlashLoan")
        .withArgs(
          flashLoanBase.address,
          flashLoanBase.address,
          weth.address,
          wethAmt,
          wethPremiumAmt
        );
      await expect(flashLoanTx)
        .to.emit(diamondFlashLoan, "FlashLoan")
        .withArgs(
          flashLoanBase.address,
          flashLoanBase.address,
          wbtc.address,
          wbtcAmt,
          wbtcPremiumAmt
        );
      await expect(flashLoanTx)
        .to.emit(diamondFlashLoan, "FlashLoan")
        .withArgs(
          flashLoanBase.address,
          flashLoanBase.address,
          usdc.address,
          usdcAmt,
          usdcPremiumAmt
        );
      await expect(flashLoanTx)
        .to.emit(diamondFlashLoan, "FlashLoan")
        .withArgs(
          flashLoanBase.address,
          flashLoanBase.address,
          usdt.address,
          usdtAmt,
          usdtPremiumAmt
        );
      await expect(flashLoanTx)
        .to.emit(diamondFlashLoan, "FlashLoan")
        .withArgs(
          flashLoanBase.address,
          flashLoanBase.address,
          dai.address,
          daiAmt,
          daiPremiumAmt
        );
    });
    it("Fail to execute flash loan, input length mismatch", async () => {
      // execute flash loan
      const assets = [
        weth.address,
        wbtc.address,
        usdc.address,
        usdt.address,
        dai.address,
      ];
      // invalid input length
      const amounts = [wethAmt, wbtcAmt, usdcAmt, usdtAmt, daiAmt, 0];

      // expect to revert
      await expect(
        flashLoanBase.connect(user1).flashLoanCall(assets, amounts)
      ).revertedWithCustomError(diamondFlashLoan, "InputLengthMismatch");
    });
  });
  describe("Flash loan to liquidation", () => {
    let flashLoanToLiquidation: FlashLoanToLiquidation;
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
    let usdc: ERC20Mock;
    let usdcAmt: BigNumber;
    let usdcPremiumAmt: BigNumber;

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

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      // deploy flashLoanToLiquidation
      const FlashLoanToLiquidation = await ethers.getContractFactory(
        "FlashLoanToLiquidation"
      );
      flashLoanToLiquidation = (await FlashLoanToLiquidation.connect(
        liquidator
      ).deploy(zkTrueUp.address, loanId)) as FlashLoanToLiquidation;
      await flashLoanToLiquidation.deployed();

      usdc = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDC]
      )) as ERC20Mock;

      // mint default usdc to zkTrueUp for flash loan test
      usdcAmt = utils.parseUnits("500", TS_BASE_TOKEN.USDC.decimals);
      await usdc.connect(user1).mint(zkTrueUp.address, usdcAmt);

      // mint flash loan amount + premium (500 + 500 * 0.03% = 500.15) to flashLoanToLiquidation contract
      usdcPremiumAmt = utils.parseUnits("0.15", TS_BASE_TOKEN.USDC.decimals);
      const amount = usdcAmt.add(usdcPremiumAmt);
      await usdc.connect(user1).mint(flashLoanToLiquidation.address, amount);
    });
    it("Success to execute flash loan to liquidate", async () => {
      // set the price for liquidation
      // eth = 620 usd, usdc = 1 usd
      // healthFactor = 0.992 < 1
      // set eth price
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON = {
          roundId: 1,
          answer: "62000000000", // 620 usd
          startedAt: 0,
          updatedAt: 0,
          answeredInRound: 0,
        },
        ethAnswer = await (
          await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
        ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON = {
          roundId: 1,
          answer: "100000000", // 1 usd
          startedAt: 0,
          updatedAt: 0,
          answeredInRound: 0,
        },
        usdcAnswer = await (
          await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
        ).answer;

      // before balance
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const beforeTreasuryUsdcBalance = await usdc.balanceOf(treasuryAddr);
      const beforeLiquidatorUsdcBalance = await usdc.balanceOf(
        await liquidator.getAddress()
      );
      const beforeFlashLoanToLiquidationUsdcBalance = await usdc.balanceOf(
        flashLoanToLiquidation.address
      );
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeFlashLoanToLiquidationEthBalance =
        await ethers.provider.getBalance(flashLoanToLiquidation.address);
      const beforeTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );
      const beforeLiquidatorEthBalance = await ethers.provider.getBalance(
        await liquidator.getAddress()
      );

      // execute flash loan to liquidate and transfer the reward to liquidator
      const flashLoanTx = await flashLoanToLiquidation
        .connect(liquidator)
        .flashLoanCall([usdc.address], [usdcAmt]);
      const flashLoanReceipt = await flashLoanTx.wait();

      // gas fee
      const flashLoanGas = BigNumber.from(flashLoanReceipt.gasUsed).mul(
        flashLoanReceipt.effectiveGasPrice
      );
      // after balance
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);
      const afterTreasuryUsdcBalance = await usdc.balanceOf(treasuryAddr);
      const afterLiquidatorUsdcBalance = await usdc.balanceOf(
        await liquidator.getAddress()
      );
      const afterFlashLoanToLiquidationUsdcBalance = await usdc.balanceOf(
        flashLoanToLiquidation.address
      );
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterFlashLoanToLiquidationEthBalance =
        await ethers.provider.getBalance(flashLoanToLiquidation.address);
      const afterTreasuryEthBalance = await ethers.provider.getBalance(
        treasuryAddr
      );
      const afterLiquidatorEthBalance = await ethers.provider.getBalance(
        await liquidator.getAddress()
      );

      // calculate expected amount
      // liquidator repay amount with debt token decimals
      const repayAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      const debtValue = repayAmt.mul(usdcAnswer);

      // liquidator reward with collateral token L1 decimals
      const liquidatorReward = getLiquidatorRewardAmt(
        debtValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      // protocol penalty with collateral token L1 decimals
      const protocolPenalty = getProtocolPenaltyAmt(
        debtValue,
        TS_BASE_TOKEN.ETH,
        TS_BASE_TOKEN.USDC,
        liquidationFactor,
        ethAnswer
      );

      // check balance
      expect(afterZkTrueUpUsdcBalance.sub(beforeZkTrueUpUsdcBalance)).to.eq(
        repayAmt
      );
      expect(afterTreasuryUsdcBalance.sub(beforeTreasuryUsdcBalance)).to.eq(
        usdcPremiumAmt
      );
      expect(
        beforeFlashLoanToLiquidationUsdcBalance.sub(
          afterFlashLoanToLiquidationUsdcBalance
        )
      ).to.eq(usdcAmt.add(usdcPremiumAmt));
      expect(afterLiquidatorUsdcBalance).to.eq(beforeLiquidatorUsdcBalance);
      expect(
        beforeZkTrueUpWethBalance.sub(liquidatorReward).sub(protocolPenalty)
      ).to.eq(afterZkTrueUpWethBalance);
      expect(beforeTreasuryEthBalance.add(protocolPenalty)).to.eq(
        afterTreasuryEthBalance
      );
      expect(afterFlashLoanToLiquidationEthBalance).to.eq(
        beforeFlashLoanToLiquidationEthBalance
      );
      expect(
        beforeLiquidatorEthBalance.add(liquidatorReward).sub(flashLoanGas)
      ).to.eq(afterLiquidatorEthBalance);

      // check event
      await expect(flashLoanTx)
        .to.emit(diamondFlashLoan, "FlashLoan")
        .withArgs(
          flashLoanToLiquidation.address,
          flashLoanToLiquidation.address,
          usdc.address,
          usdcAmt,
          usdcPremiumAmt
        );
    });
  });
  describe("Set & Get flash loan premium", () => {
    it("Success to set & get flash loan premium", async () => {
      const newFlashLoanPremium = 9;
      const setFlashLoanPremiumTx = await diamondFlashLoan
        .connect(admin)
        .setFlashLoanPremium(newFlashLoanPremium);
      await setFlashLoanPremiumTx.wait();

      const flashLoanPremium = await diamondFlashLoan.getFlashLoanPremium();
      expect(flashLoanPremium).to.be.equal(newFlashLoanPremium);
    });
    it("Fail to set flash loan premium, sender is not admin", async () => {
      const newFlashLoanPremium = 9;
      await expect(
        diamondFlashLoan.connect(user1).setFlashLoanPremium(newFlashLoanPremium)
      ).to.be.reverted;
    });
  });
});

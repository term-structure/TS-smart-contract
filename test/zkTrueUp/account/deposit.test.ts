import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { toL2Amt } from "../../utils/amountConvertor";
import { DEFAULT_ZERO_ADDR } from "../../../utils/config";
import { register } from "../../utils/register";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { BaseTokenAddresses } from "../../../utils/type";
import { tsbTokensJSON } from "../../data/tsbTokens";
import {
  AccountMock,
  ERC20Mock,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  TsbToken,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  DEFAULT_ETH_ADDRESS,
  MIN_DEPOSIT_AMOUNT,
  TS_BASE_TOKEN,
  TS_DECIMALS,
  TsTokenId,
} from "term-structure-sdk";

//! use AccountMock instead of AccountFacet for testing
export const FACET_NAMES_MOCK = [
  "AccountMock", // replace AccountFacet with AccountMock
  "AddressFacet",
  "FlashLoanFacet",
  "ProtocolParamsFacet",
  "LoanFacet",
  "RollupFacet",
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

describe("Deposit", function () {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let operator: Signer;
  let diamondAccMock: AccountMock;
  let diamondRollup: RollupFacet;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let usdt: ERC20Mock;
  const INVALID_TOKEN_ADDRESS = "0x1234567890123456789012345678901234567890";

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    operator = res.operator;
    diamondAccMock = (await useFacet("AccountMock", zkTrueUp)) as AccountMock;
    diamondRollup = (await useFacet("RollupFacet", zkTrueUp)) as RollupFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUp)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUp)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    usdt = await ethers.getContractAt(
      "ERC20Mock",
      baseTokenAddresses[TsTokenId.USDT]
    );
  });

  describe("Deposit with ERC20", function () {
    it("Success to deposit", async function () {
      // mimic register
      const regAmount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await register(
        user1,
        Number(TsTokenId.ETH),
        regAmount,
        baseTokenAddresses,
        diamondAccMock
      );

      // before deposit
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeAccountNum = await diamondAccMock.getAccountNum();
      const beforeTotalPendingRequests = (await diamondRollup.getL1RequestNum())
        .totalL1RequestNum;

      // call deposit
      const amount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, amount);
      await usdt.connect(user1).approve(zkTrueUp.address, amount);
      await diamondAccMock
        .connect(user1)
        .deposit(user1Addr, usdt.address, amount);

      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterAccountNum = await diamondAccMock.getAccountNum();
      const afterTotalPendingRequests = (await diamondRollup.getL1RequestNum())
        .totalL1RequestNum;

      // check
      expect(afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)).to.be.eq(
        amount
      );
      expect(afterAccountNum).to.be.eq(beforeAccountNum);
      expect(
        afterTotalPendingRequests.sub(beforeTotalPendingRequests)
      ).to.be.eq(1);

      // check the request is existed in the priority queue
      const l2Addr = await diamondAccMock.getAccountId(user1Addr);
      const l2TokenAddr = await diamondToken.getTokenId(usdt.address);
      const l2Amt = toL2Amt(amount, TS_BASE_TOKEN.USDT);

      const deposit = {
        accountId: l2Addr,
        tokenId: l2TokenAddr,
        amount: l2Amt,
      };
      const requestId = (
        await diamondRollup.getL1RequestNum()
      ).totalL1RequestNum.sub(1);
      const success = await diamondRollup.isDepositInL1RequestQueue(
        deposit,
        requestId
      );
      expect(success).to.be.true;
    });

    it("Failed to deposit, user needs to register before deposit", async function () {
      // call deposit
      const amount = MIN_DEPOSIT_AMOUNT.USDT * (await usdt.decimals());
      await usdt.connect(user2).mint(user2Addr, amount);
      await usdt.connect(user2).approve(zkTrueUp.address, amount);
      await expect(
        diamondAccMock.connect(user2).deposit(user2Addr, usdt.address, amount)
      ).to.be.revertedWithCustomError(diamondAccMock, "AccountIsNotRegistered");
    });

    it("Failed to deposit, the deposit token needs to be whitelisted", async function () {
      const randAddr = ethers.Wallet.createRandom().address;
      const nonWhitelistToken = await ethers.getContractAt(
        "ERC20Mock",
        randAddr
      );
      // mimic register
      const regAmount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await register(
        user1,
        Number(TsTokenId.ETH),
        regAmount,
        baseTokenAddresses,
        diamondAccMock
      );

      // call deposit
      const amount = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      await nonWhitelistToken.connect(user1).mint(user1Addr, amount);
      await nonWhitelistToken.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        diamondAccMock
          .connect(user1)
          .deposit(user1Addr, nonWhitelistToken.address, amount)
      ).to.be.revertedWithCustomError(diamondToken, "TokenIsNotExist");
    });

    it("Failed to deposit, the deposit amount less than the minimum deposit amount", async function () {
      // mimic register
      const regAmount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await register(
        user1,
        Number(TsTokenId.ETH),
        regAmount,
        baseTokenAddresses,
        diamondAccMock
      );

      // 5 < min deposit amount
      const amount = utils.parseUnits("5", await usdt.decimals());
      await usdt.connect(user1).mint(user1Addr, amount);
      await usdt.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        diamondAccMock.connect(user1).deposit(user1Addr, usdt.address, amount)
      ).to.be.revertedWithCustomError(diamondAccMock, "InvalidDepositAmt");
    });
  });

  describe("Deposit with ETH", function () {
    it("Success to deposit", async function () {
      // mimic register
      const regAmount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await register(
        user1,
        Number(TsTokenId.ETH),
        regAmount,
        baseTokenAddresses,
        diamondAccMock
      );

      // before deposit
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeAccountNum = await diamondAccMock.getAccountNum();
      const beforeTotalPendingRequests = (await diamondRollup.getL1RequestNum())
        .totalL1RequestNum;

      // call deposit
      const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await weth.connect(user1).approve(zkTrueUp.address, amount);
      await diamondAccMock
        .connect(user1)
        .deposit(user1Addr, DEFAULT_ETH_ADDRESS, amount, {
          value: amount,
        });

      // after deposit
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterAccountNum = await diamondAccMock.getAccountNum();
      const afterTotalPendingRequests = (await diamondRollup.getL1RequestNum())
        .totalL1RequestNum;

      // check
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.be.eq(
        amount
      );
      expect(afterAccountNum).to.be.eq(beforeAccountNum);
      expect(
        afterTotalPendingRequests.sub(beforeTotalPendingRequests)
      ).to.be.eq(1);

      // check the request is existed in the priority queue
      const l2Addr = await diamondAccMock.getAccountId(user1Addr);
      const l2TokenAddr = await diamondToken.getTokenId(DEFAULT_ETH_ADDRESS);
      const l2Amt = toL2Amt(amount, TS_BASE_TOKEN.ETH);
      const deposit = {
        accountId: l2Addr,
        tokenId: l2TokenAddr,
        amount: l2Amt,
      };
      const requestId = (
        await diamondRollup.getL1RequestNum()
      ).totalL1RequestNum.sub(1);
      const success = await diamondRollup.isDepositInL1RequestQueue(
        deposit,
        requestId
      );
      expect(success).to.be.true;
    });

    it("Failed to deposit, user needs to register first", async function () {
      // call deposit
      const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await weth.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        diamondAccMock
          .connect(user1)
          .deposit(user1Addr, DEFAULT_ETH_ADDRESS, amount, {
            value: amount,
          })
      ).to.be.revertedWithCustomError(diamondAccMock, "AccountIsNotRegistered");
    });

    it("Failed to deposit, the deposit amount less than the minimum deposit amount", async function () {
      // mimic register
      const regAmount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await register(
        user1,
        Number(TsTokenId.ETH),
        regAmount,
        baseTokenAddresses,
        diamondAccMock
      );

      // call deposit
      const amount = ethers.utils.parseEther(
        (MIN_DEPOSIT_AMOUNT.ETH / 2).toString()
      );
      await weth.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        diamondAccMock
          .connect(user1)
          .deposit(user1Addr, DEFAULT_ETH_ADDRESS, amount, {
            value: amount,
          })
      ).to.be.revertedWithCustomError(diamondAccMock, "InvalidDepositAmt");
    });
  });

  describe("Deposit TSB token", () => {
    beforeEach(async () => {
      // create tsb tokens
      for (let i = 0; i < tsbTokensJSON.length; i++) {
        const underlyingTokenId = tsbTokensJSON[i].underlyingTokenId;
        const maturity = BigNumber.from(tsbTokensJSON[i].maturity);
        const name = tsbTokensJSON[i].name;
        const symbol = tsbTokensJSON[i].symbol;
        await (
          await diamondTsb
            .connect(operator)
            .createTsbToken(underlyingTokenId, maturity, name, symbol)
        ).wait();

        // whitelist tsb token
        const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
          underlyingTokenId,
          maturity
        );
        const assetConfig = {
          isStableCoin: tsbTokensJSON[i].isStableCoin,
          isTsbToken: true,
          decimals: TS_DECIMALS.AMOUNT,
          minDepositAmt: tsbTokensJSON[1].minDepositAmt,
          tokenAddr: tsbTokenAddr,
          priceFeed: DEFAULT_ZERO_ADDR,
        };
        await diamondToken.connect(operator).addToken(assetConfig);
      }

      // register by ETH
      const registerAmt = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      await register(
        user1,
        Number(TsTokenId.ETH),
        registerAmt,
        baseTokenAddresses,
        diamondAccMock
      );

      // transfer default WETH amount to zkTrueUp
      const wethAmount = utils.parseEther("10");
      await (
        await weth.connect(operator).deposit({ value: wethAmount })
      ).wait();
      await (
        await weth.connect(operator).transfer(zkTrueUp.address, wethAmount)
      ).wait();

      // transfer default USDT amount to zkTrueUp
      const usdtAmount = utils.parseUnits("1000", TS_BASE_TOKEN.USDT.decimals);
      const underlyingAssetAddr = baseTokenAddresses[TsTokenId.USDT];
      const baseToken = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;
      await (
        await baseToken.connect(operator).mint(zkTrueUp.address, usdtAmount)
      ).wait(); // mint to zkTrueUp

      // withdraw tsbETH token
      const tsbEthAmt = utils.parseUnits("10", TS_DECIMALS.AMOUNT);
      let underlyingTokenId = tsbTokensJSON[0].underlyingTokenId;
      let maturity = BigNumber.from(tsbTokensJSON[0].maturity);
      const tsbEth = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      await (
        await diamondAccMock.connect(user1).withdraw(tsbEth, tsbEthAmt)
      ).wait(); //! ignore _withdraw in AccountMock

      // withdraw tsbUSDT token
      const tsbUsdtAmt = utils.parseUnits("100", TS_DECIMALS.AMOUNT);
      underlyingTokenId = tsbTokensJSON[2].underlyingTokenId;
      maturity = BigNumber.from(tsbTokensJSON[2].maturity);
      const tsbUsdt = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      await (
        await diamondAccMock.connect(user1).withdraw(tsbUsdt, tsbUsdtAmt)
      ).wait(); //! ignore _withdraw in AccountMock
    });

    it("Success to deposit tsb token", async () => {
      // get params tsbUSDT
      const underlyingTokenId = tsbTokensJSON[2].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[2].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );

      // tsb token token decimals is 8
      const amount = utils.parseUnits("100", TS_DECIMALS.AMOUNT);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdt = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsb.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeTsbTokenTotalSupply = await diamondTsb.activeSupply(
        tsbTokenAddr
      );
      const beforeUser1UsdtBalance = await usdt.balanceOf(user1Addr);
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);

      // deposit tsb token
      const depositTsbTokenTx = await diamondAccMock
        .connect(user1)
        .deposit(user1Addr, tsbTokenAddr, amount);
      await depositTsbTokenTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsb.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsb.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdtBalance = await usdt.balanceOf(user1Addr);
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);

      const diamondWithTsbLib = await ethers.getContractAt(
        "TsbLib",
        zkTrueUp.address
      );
      // check event
      await expect(depositTsbTokenTx)
        .to.emit(diamondWithTsbLib, "TsbTokenBurned")
        .withArgs(tsbTokenAddr, user1Addr, amount);

      // check tsb token amount
      expect(
        beforeUser1TsbTokenBalance.sub(afterUser1TsbTokenBalance)
      ).to.equal(amount);
      expect(beforeTsbTokenTotalSupply.sub(afterTsbTokenTotalSupply)).to.equal(
        amount
      );
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      expect(await tsbToken.balanceOf(zkTrueUp.address)).to.equal(0);

      // check underlying asset amount
      expect(beforeUser1UsdtBalance).to.equal(afterUser1UsdtBalance);
      expect(beforeZkTrueUpUsdtBalance).to.equal(afterZkTrueUpUsdtBalance);
    });

    it("Fail to deposit tsb token, invalid token address", async () => {
      // get params
      const invalidTsbTokenAddr = INVALID_TOKEN_ADDRESS; // invalid tsb token address
      const amount = utils.parseEther("0.5");

      // deposit tsb token with invalid token address
      await expect(
        diamondAccMock
          .connect(user1)
          .deposit(user1Addr, invalidTsbTokenAddr, amount)
      ).to.be.revertedWithCustomError(diamondAccMock, "TokenIsNotExist");
    });

    it("Fail to deposit tsb token, not a registered account", async () => {
      // get params tsbUSDT
      const underlyingTokenId = tsbTokensJSON[2].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[2].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );

      // tsb token token decimals is 8
      const amount = utils.parseUnits("0.5", TS_DECIMALS.AMOUNT);
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      await (await tsbToken.connect(user1).transfer(user2Addr, amount)).wait();

      // deposit tsb token with a not registered account
      await expect(
        diamondAccMock.connect(user2).deposit(user2Addr, tsbTokenAddr, amount)
      ).to.be.revertedWithCustomError(diamondAccMock, "AccountIsNotRegistered");
    });
  });
});

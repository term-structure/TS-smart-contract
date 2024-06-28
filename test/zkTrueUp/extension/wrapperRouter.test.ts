import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { DEFAULT_ZERO_ADDR } from "../../../utils/config";
import { register } from "../../utils/register";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { BaseTokenAddresses } from "../../../utils/type";
import {
  AccountMock,
  ERC20Mock,
  TokenFacet,
  TokenWrapper,
  WrapperRouter,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  MIN_DEPOSIT_AMOUNT,
  TS_BASE_TOKEN,
  TsTokenId,
} from "term-structure-sdk";
import { DELEGATE_WITHDRAW_MASK } from "../../utils/delegate";
const { upgrades } = require("hardhat");

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

describe("WrapperRouter", function () {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let zkTrueUp: ZkTrueUp;
  let operator: Signer;
  let diamondAccMock: AccountMock;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let usdt: ERC20Mock;
  let wrappedUsdt: TokenWrapper;
  let wrapperRouter: WrapperRouter;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    zkTrueUp = res.zkTrueUp;
    operator = res.operator;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAccMock = (await useFacet(
      "AccountMock",
      zkTrueUpAddr
    )) as AccountMock;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    usdt = await ethers.getContractAt(
      "ERC20Mock",
      baseTokenAddresses[TsTokenId.USDT]
    );

    // deploy token wrapper
    const wrappedUsdtFactory = await ethers.getContractFactory("TokenWrapper");
    wrappedUsdt = await wrappedUsdtFactory.deploy(
      usdt.address,
      "wUSDT",
      "wUSDT"
    );
    await wrappedUsdt.deployed();

    // deploy wrapper router
    const WrapperRouterFactory = await ethers.getContractFactory(
      "WrapperRouter"
    );
    const proxy = await upgrades.deployProxy(
      WrapperRouterFactory,
      [zkTrueUpAddr],
      { initializer: "initialize" }
    );
    wrapperRouter = await ethers.getContractAt("WrapperRouter", proxy.address);

    // add wrapped token to zkTrueUp
    const assetConfig = {
      isStableCoin: true,
      isTsbToken: false,
      decimals: 6,
      minDepositAmt: "0",
      token: wrappedUsdt.address,
      priceFeed: DEFAULT_ZERO_ADDR,
    };
    await diamondToken.connect(operator).addToken(assetConfig);

    // mimic register
    const regAmount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await register(
      user1,
      Number(TsTokenId.ETH),
      regAmount,
      baseTokenAddresses,
      diamondAccMock
    );
  });

  describe("Deposit Wrapped Token", function () {
    it("Success to deposit by wrapper router, wrap amount = deposit amount", async function () {
      // prepare usdt
      const amount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, amount);

      // before deposit
      const beforeZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const beforeUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const beforeTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const beforeWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // call deposit
      await usdt.connect(user1).approve(wrapperRouter.address, amount);
      await wrapperRouter
        .connect(user1)
        .wrapToDeposit(wrappedUsdt.address, amount, amount);

      const afterZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const afterUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const afterTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const afterWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // check
      expect(
        afterZkTrueUpWUsdtBalance.sub(beforeZkTrueUpWUsdtBalance)
      ).to.be.eq(amount);
      expect(beforeUserUsdtBalance.sub(afterUserUsdtBalance)).to.be.eq(amount);
      expect(
        afterTokenWrapperUsdtBalance.sub(beforeTokenWrapperUsdtBalance)
      ).to.be.eq(amount);
      expect(afterWUsdtTotalSupply.sub(beforeWUsdtTotalSupply)).to.be.eq(
        amount
      );
    });
    it("Success to deposit by wrapper router, wrap amount < deposit amount", async function () {
      // prepare usdt
      const wrapAmount = utils.parseUnits("5", TS_BASE_TOKEN.USDT.decimals);
      const depositAmount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, depositAmount);
      await usdt
        .connect(user1)
        .approve(wrappedUsdt.address, depositAmount.sub(wrapAmount));
      await wrappedUsdt
        .connect(user1)
        .depositFor(user1Addr, depositAmount.sub(wrapAmount));

      // before deposit
      const beforeZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const beforeUserWUsdtBalance = await wrappedUsdt.balanceOf(user1Addr);
      const beforeUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const beforeTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const beforeWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // call deposit
      await usdt.connect(user1).approve(wrapperRouter.address, wrapAmount);
      await wrappedUsdt
        .connect(user1)
        .approve(wrapperRouter.address, depositAmount.sub(wrapAmount));
      await wrapperRouter
        .connect(user1)
        .wrapToDeposit(wrappedUsdt.address, wrapAmount, depositAmount);

      const afterZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const afterUserWUsdtBalance = await wrappedUsdt.balanceOf(user1Addr);
      const afterUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const afterTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const afterWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // check
      expect(
        afterZkTrueUpWUsdtBalance.sub(beforeZkTrueUpWUsdtBalance)
      ).to.be.eq(depositAmount);
      expect(beforeUserWUsdtBalance.sub(afterUserWUsdtBalance)).to.be.eq(
        depositAmount.sub(wrapAmount)
      );
      expect(beforeUserUsdtBalance.sub(afterUserUsdtBalance)).to.be.eq(
        wrapAmount
      );
      expect(
        afterTokenWrapperUsdtBalance.sub(beforeTokenWrapperUsdtBalance)
      ).to.be.eq(wrapAmount);
      expect(afterWUsdtTotalSupply.sub(beforeWUsdtTotalSupply)).to.be.eq(
        wrapAmount
      );
    });
    it("Success to deposit by wrapper router, wrap amount > deposit amount", async function () {
      // prepare usdt
      const wrapAmount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      const depositAmount = utils.parseUnits("5", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, wrapAmount);

      // before deposit
      const beforeZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const beforeUserWUsdtBalance = await wrappedUsdt.balanceOf(user1Addr);
      const beforeUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const beforeTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const beforeWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // call deposit
      await usdt.connect(user1).approve(wrapperRouter.address, wrapAmount);
      await wrapperRouter
        .connect(user1)
        .wrapToDeposit(wrappedUsdt.address, wrapAmount, depositAmount);

      const afterZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const afterUserWUsdtBalance = await wrappedUsdt.balanceOf(user1Addr);
      const afterUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const afterTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const afterWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // check
      expect(
        afterZkTrueUpWUsdtBalance.sub(beforeZkTrueUpWUsdtBalance)
      ).to.be.eq(depositAmount);
      expect(afterUserWUsdtBalance.sub(beforeUserWUsdtBalance)).to.be.eq(
        depositAmount
      );
      expect(beforeUserUsdtBalance.sub(afterUserUsdtBalance)).to.be.eq(
        wrapAmount
      );
      expect(
        afterTokenWrapperUsdtBalance.sub(beforeTokenWrapperUsdtBalance)
      ).to.be.eq(wrapAmount);
      expect(afterWUsdtTotalSupply.sub(beforeWUsdtTotalSupply)).to.be.eq(
        wrapAmount
      );
    });
  });
  describe("Withdraw  Wrapped Token", function () {
    it("Success to withdraw by wrapper router, unwrap amount = withdraw amount", async function () {
      // prepare usdt
      const amount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, amount);
      await usdt.connect(user1).approve(wrapperRouter.address, amount);
      await wrapperRouter
        .connect(user1)
        .wrapToDeposit(wrappedUsdt.address, amount, amount);

      // before withdraw
      const beforeZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const beforeUser1UsdtBalance = await usdt.balanceOf(user1Addr);
      const beforeTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const beforeWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // set router as delegatee to withdraw
      await diamondAccMock
        .connect(user1)
        .setDelegatee(wrapperRouter.address, DELEGATE_WITHDRAW_MASK);

      // pre-approve wrapped router
      await wrappedUsdt.connect(user1).approve(wrapperRouter.address, amount);

      await wrapperRouter
        .connect(user1)
        .withdrawToUnwrap(wrappedUsdt.address, amount, amount); //! ignore _withdraw in AccountMock

      // after balance
      const afterZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const afterUser1UsdtBalance = await usdt.balanceOf(user1Addr);
      const afterTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const afterWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // check
      expect(
        beforeZkTrueUpWUsdtBalance.sub(afterZkTrueUpWUsdtBalance)
      ).to.be.eq(amount);
      expect(afterUser1UsdtBalance.sub(beforeUser1UsdtBalance)).to.be.eq(
        amount
      );
      expect(
        beforeTokenWrapperUsdtBalance.sub(afterTokenWrapperUsdtBalance)
      ).to.be.eq(amount);
      expect(beforeWUsdtTotalSupply.sub(afterWUsdtTotalSupply)).to.be.eq(
        amount
      );
    });
    it("Success to withdraw by wrapper router, unwrap amount < withdraw amount", async function () {
      // prepare usdt
      const depositAmount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, depositAmount);
      await usdt.connect(user1).approve(wrapperRouter.address, depositAmount);
      await wrapperRouter
        .connect(user1)
        .wrapToDeposit(wrappedUsdt.address, depositAmount, depositAmount);

      const unwrapAmount = utils.parseUnits("5", TS_BASE_TOKEN.USDT.decimals);
      const withdrawAmount = utils.parseUnits(
        "10",
        TS_BASE_TOKEN.USDT.decimals
      );

      // before withdraw
      const beforeZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const beforeUserWUsdtBalance = await wrappedUsdt.balanceOf(user1Addr);
      const beforeUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const beforeTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const beforeWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // set router as delegatee to withdraw
      await diamondAccMock
        .connect(user1)
        .setDelegatee(wrapperRouter.address, DELEGATE_WITHDRAW_MASK);

      // pre-approve wrapped router
      await wrappedUsdt
        .connect(user1)
        .approve(wrapperRouter.address, unwrapAmount);

      await wrapperRouter
        .connect(user1)
        .withdrawToUnwrap(wrappedUsdt.address, unwrapAmount, withdrawAmount); //! ignore _withdraw in AccountMock

      // after balance
      const afterZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const afterUserWUsdtBalance = await wrappedUsdt.balanceOf(user1Addr);
      const afterUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const afterTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const afterWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // check
      expect(
        beforeZkTrueUpWUsdtBalance.sub(afterZkTrueUpWUsdtBalance)
      ).to.be.eq(withdrawAmount);
      expect(afterUserWUsdtBalance.sub(beforeUserWUsdtBalance)).to.be.eq(
        withdrawAmount.sub(unwrapAmount)
      );
      expect(afterUserUsdtBalance.sub(beforeUserUsdtBalance)).to.be.eq(
        unwrapAmount
      );
      expect(
        beforeTokenWrapperUsdtBalance.sub(afterTokenWrapperUsdtBalance)
      ).to.be.eq(unwrapAmount);
      expect(beforeWUsdtTotalSupply.sub(afterWUsdtTotalSupply)).to.be.eq(
        unwrapAmount
      );
    });
    it("Success to withdraw by wrapper router, unwrap amount > withdraw amount", async function () {
      // prepare usdt
      const depositAmount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, depositAmount);
      await usdt.connect(user1).approve(wrapperRouter.address, depositAmount);
      await wrapperRouter
        .connect(user1)
        .wrapToDeposit(wrappedUsdt.address, depositAmount, depositAmount);

      const unwrapAmount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      const withdrawAmount = utils.parseUnits("5", TS_BASE_TOKEN.USDT.decimals);
      // prepare diff amount
      await usdt.connect(user1).mint(user1Addr, unwrapAmount);
      await usdt
        .connect(user1)
        .approve(wrappedUsdt.address, unwrapAmount.sub(withdrawAmount));
      await wrappedUsdt
        .connect(user1)
        .depositFor(user1Addr, unwrapAmount.sub(withdrawAmount));

      // before withdraw
      const beforeZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const beforeUserWUsdtBalance = await wrappedUsdt.balanceOf(user1Addr);
      const beforeUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const beforeTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const beforeWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // set router as delegatee to withdraw
      await diamondAccMock
        .connect(user1)
        .setDelegatee(wrapperRouter.address, DELEGATE_WITHDRAW_MASK);

      // pre-approve wrapped router
      await wrappedUsdt
        .connect(user1)
        .approve(wrapperRouter.address, unwrapAmount);

      await wrapperRouter
        .connect(user1)
        .withdrawToUnwrap(wrappedUsdt.address, unwrapAmount, withdrawAmount); //! ignore _withdraw in AccountMock

      // after balance
      const afterZkTrueUpWUsdtBalance = await wrappedUsdt.balanceOf(
        zkTrueUp.address
      );
      const afterUserWUsdtBalance = await wrappedUsdt.balanceOf(user1Addr);
      const afterUserUsdtBalance = await usdt.balanceOf(user1Addr);
      const afterTokenWrapperUsdtBalance = await usdt.balanceOf(
        wrappedUsdt.address
      );
      const afterWUsdtTotalSupply = await wrappedUsdt.totalSupply();

      // check
      expect(
        beforeZkTrueUpWUsdtBalance.sub(afterZkTrueUpWUsdtBalance)
      ).to.be.eq(withdrawAmount);
      expect(afterUserWUsdtBalance.sub(beforeUserWUsdtBalance)).to.be.eq(
        withdrawAmount.sub(unwrapAmount)
      );
      expect(afterUserUsdtBalance.sub(beforeUserUsdtBalance)).to.be.eq(
        unwrapAmount
      );
      expect(
        beforeTokenWrapperUsdtBalance.sub(afterTokenWrapperUsdtBalance)
      ).to.be.eq(unwrapAmount);
      expect(beforeWUsdtTotalSupply.sub(afterWUsdtTotalSupply)).to.be.eq(
        unwrapAmount
      );
    });
  });
});

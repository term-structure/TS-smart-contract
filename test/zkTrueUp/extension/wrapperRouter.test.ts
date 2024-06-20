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
  RollupFacet,
  TokenFacet,
  TokenWrapper,
  TsbFacet,
  WrapperRouter,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  MIN_DEPOSIT_AMOUNT,
  TS_BASE_TOKEN,
  TsTokenId,
} from "term-structure-sdk";
import { DELEGATE_WITHDRAW_MASK } from "../../utils/delegate";

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
  let wrappedRouter: WrapperRouter;

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
    const wrappedRouterFactory = await ethers.getContractFactory(
      "WrapperRouter"
    );
    wrappedRouter = await wrappedRouterFactory.deploy(zkTrueUpAddr);

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
    it("Success to deposit by wrapper router", async function () {
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
      await usdt.connect(user1).approve(wrappedRouter.address, amount);
      await wrappedRouter
        .connect(user1)
        .wrapToDeposit(wrappedUsdt.address, amount);

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
  });
  describe("Withdraw  Wrapped Token", function () {
    it("Success to withdraw by wrapper router", async function () {
      // prepare usdt
      const amount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, amount);
      await usdt.connect(user1).approve(wrappedRouter.address, amount);
      await wrappedRouter
        .connect(user1)
        .wrapToDeposit(wrappedUsdt.address, amount);

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
        .setDelegatee(wrappedRouter.address, DELEGATE_WITHDRAW_MASK);

      // pre-approve wrapped router
      await wrappedUsdt.connect(user1).approve(wrappedRouter.address, amount);

      await wrappedRouter
        .connect(user1)
        .unwrapToWithdraw(wrappedUsdt.address, amount); //! ignore _withdraw in AccountMock

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
  });
});

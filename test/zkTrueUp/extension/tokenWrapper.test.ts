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
  WETH9,
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
  let [user1]: Signer[] = [];
  let [user1Addr]: string[] = [];
  let zkTrueUp: ZkTrueUp;
  let operator: Signer;
  let diamondAccMock: AccountMock;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let usdt: ERC20Mock;
  let wrappedETH: TokenWrapper;
  let wrapperRouter: WrapperRouter;
  let weth: WETH9;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1] = await ethers.getSigners();
    [user1Addr] = await Promise.all([user1.getAddress()]);
    weth = res.weth;
    // deploy token wrapper
    const wrappedETHFactory = await ethers.getContractFactory("TokenWrapper");
    wrappedETH = await wrappedETHFactory.deploy(
      weth.address,
      "Wrapped ETH for PT-weETH as collateral",
      "ETH:PT-weETH"
    );
    await wrappedETH.deployed();
  });
  describe("Wrap ETH", function () {
    it("Success to wrap ETH", async function () {
      // prepare ETH
      const amount = utils.parseEther("1");

      // before deposit
      const beforeUserETHBalance = await user1.getBalance();
      const beforeWrappedETHWETHBalance = await weth.balanceOf(
        wrappedETH.address
      );
      const beforeWrappedETHTotalSupply = await wrappedETH.totalSupply();

      const tx = await wrappedETH
        .connect(user1)
        .depositForETH(user1Addr, amount, { value: amount });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed.mul(ethers.BigNumber.from(tx.gasPrice));

      // after deposit
      const afterUserETHBalance = await user1.getBalance();
      const afterWrappedETHWETHBalance = await weth.balanceOf(
        wrappedETH.address
      );
      const afterWrappedETHTotalSupply = await wrappedETH.totalSupply();

      // check
      expect(beforeUserETHBalance.sub(afterUserETHBalance)).to.be.eq(
        amount.add(gasCost)
      );
      expect(
        afterWrappedETHWETHBalance.sub(beforeWrappedETHWETHBalance)
      ).to.be.eq(amount);
      expect(
        afterWrappedETHTotalSupply.sub(beforeWrappedETHTotalSupply)
      ).to.be.eq(amount);
    });
    it("Fail to wrap ETH, amount != msg.value", async function () {
      // prepare ETH
      const amount = utils.parseEther("1");
      const msgValue = utils.parseEther("2");

      expect(
        wrappedETH
          .connect(user1)
          .depositForETH(user1Addr, amount, { value: msgValue })
      ).to.be.revertedWithCustomError(wrappedETH, "InvalidMsgValue");
    });
  });
  describe("Unwrap ETH", function () {
    it("Success to unwrap ETH", async function () {
      // prepare ETH
      const amount = utils.parseEther("1");
      await wrappedETH
        .connect(user1)
        .depositForETH(user1Addr, amount, { value: amount });

      // before unwrap
      const beforeUserETHBalance = await user1.getBalance();
      const beforeWrappedETHWETHBalance = await weth.balanceOf(
        wrappedETH.address
      );
      const beforeWrappedETHTotalSupply = await wrappedETH.totalSupply();

      // unwrap
      const tx = await wrappedETH
        .connect(user1)
        .withdrawToETH(user1Addr, amount);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed.mul(ethers.BigNumber.from(tx.gasPrice));

      // after unwrap
      const afterUserETHBalance = await user1.getBalance();
      const afterWrappedETHWETHBalance = await weth.balanceOf(
        wrappedETH.address
      );
      const afterWrappedETHTotalSupply = await wrappedETH.totalSupply();

      // check
      expect(afterUserETHBalance.sub(beforeUserETHBalance)).to.be.eq(
        amount.sub(gasCost)
      );
      expect(
        beforeWrappedETHWETHBalance.sub(afterWrappedETHWETHBalance)
      ).to.be.eq(amount);
      expect(
        beforeWrappedETHTotalSupply.sub(afterWrappedETHTotalSupply)
      ).to.be.eq(amount);
    });
    it("Fail to unwrap ETH, withdraw amount > balance", async function () {
      // prepare ETH
      const depositAmount = utils.parseEther("1");
      const withdrawAmount = utils.parseEther("2");
      await wrappedETH
        .connect(user1)
        .depositForETH(user1Addr, depositAmount, { value: depositAmount });

      expect(
        wrappedETH.connect(user1).withdrawToETH(user1Addr, withdrawAmount)
      ).to.be.revertedWith("");
    });
  });
});

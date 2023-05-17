import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, utils } from "ethers";
import { deployAndInit } from "../utils/deployAndInit";
import { useFacet } from "../../utils/useFacet";
import { toL2Amt } from "../utils/amountConvertor";
import { FACET_NAMES } from "../../utils/config";
import { register } from "../utils/register";
import { whiteListBaseTokens } from "../utils/whitelistToken";
import { BaseTokenAddresses } from "../../utils/type";
import {
  AccountFacet,
  ERC20Mock,
  RollupFacet,
  TokenFacet,
  WETH9,
  ZkTrueUp,
} from "../../typechain-types";
import {
  DEFAULT_ETH_ADDRESS,
  MIN_DEPOSIT_AMOUNT,
  TS_BASE_TOKEN,
  TsTokenId,
} from "term-structure-sdk";

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES);
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
  let diamondAcc: AccountFacet;
  let diamondRollup: RollupFacet;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let usdt: ERC20Mock;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUp)) as AccountFacet;
    diamondRollup = (await useFacet("RollupFacet", zkTrueUp)) as RollupFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUp)) as TokenFacet;
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
        diamondAcc
      );

      // before deposit
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeAccountNum = await diamondAcc.getAccountNum();
      const beforeTotalPendingRequests = (await diamondRollup.getL1RequestNum())
        .totalL1RequestNum;

      // call deposit
      const amount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, amount);
      await usdt.connect(user1).approve(zkTrueUp.address, amount);
      await diamondAcc.connect(user1).deposit(user1Addr, usdt.address, amount);

      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterAccountNum = await diamondAcc.getAccountNum();
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
      const l2Addr = await diamondAcc.getAccountId(user1Addr);
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
        diamondAcc.connect(user2).deposit(user2Addr, usdt.address, amount)
      ).to.be.revertedWithCustomError(diamondAcc, "AccountIsNotRegistered");
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
        diamondAcc
      );

      // call deposit
      const amount = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      await nonWhitelistToken.connect(user1).mint(user1Addr, amount);
      await nonWhitelistToken.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        diamondAcc
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
        diamondAcc
      );

      // 5 < min deposit amount
      const amount = utils.parseUnits("5", await usdt.decimals());
      await usdt.connect(user1).mint(user1Addr, amount);
      await usdt.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        diamondAcc.connect(user1).deposit(user1Addr, usdt.address, amount)
      ).to.be.revertedWithCustomError(diamondAcc, "InvalidDepositAmt");
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
        diamondAcc
      );

      // before deposit
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeAccountNum = await diamondAcc.getAccountNum();
      const beforeTotalPendingRequests = (await diamondRollup.getL1RequestNum())
        .totalL1RequestNum;

      // call deposit
      const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await weth.connect(user1).approve(zkTrueUp.address, amount);
      await diamondAcc
        .connect(user1)
        .deposit(user1.getAddress(), DEFAULT_ETH_ADDRESS, amount, {
          value: amount,
        });

      // after deposit
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterAccountNum = await diamondAcc.getAccountNum();
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
      const l2Addr = await diamondAcc.getAccountId(user1Addr);
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
        diamondAcc
          .connect(user1)
          .deposit(user1.getAddress(), DEFAULT_ETH_ADDRESS, amount, {
            value: amount,
          })
      ).to.be.revertedWithCustomError(diamondAcc, "AccountIsNotRegistered");
    });

    it("Failed to deposit, the deposit amount less than the minimum deposit amount", async function () {
      // mimic register
      const regAmount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await register(
        user1,
        Number(TsTokenId.ETH),
        regAmount,
        baseTokenAddresses,
        diamondAcc
      );

      // call deposit
      const amount = ethers.utils.parseEther(
        (MIN_DEPOSIT_AMOUNT.ETH / 2).toString()
      );
      await weth.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        diamondAcc
          .connect(user1)
          .deposit(user1Addr, DEFAULT_ETH_ADDRESS, amount, {
            value: amount,
          })
      ).to.be.revertedWithCustomError(diamondAcc, "InvalidDepositAmt");
    });
  });
});

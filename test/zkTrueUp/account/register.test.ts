import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, Wallet, utils } from "ethers";
import { BaseTokenAddresses } from "../../../utils/type";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { genTsAddr } from "../../utils/helper";
import { toL2Amt } from "../../utils/amountConvertor";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import {
  AccountFacet,
  ERC20Mock,
  RollupFacet,
  TokenFacet,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  DEFAULT_ETH_ADDRESS,
  MIN_DEPOSIT_AMOUNT,
  TS_BASE_TOKEN,
  TsTokenId,
  getTsRollupSignerFromWallet,
} from "term-structure-sdk";

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES);
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

describe("Register", function () {
  let [user1]: Signer[] = [];
  let [user1Addr]: string[] = [];
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondRollup: RollupFacet;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let usdt: ERC20Mock;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1] = await ethers.getSigners();
    [user1Addr] = await Promise.all([user1.getAddress()]);
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    usdt = await ethers.getContractAt(
      "ERC20Mock",
      baseTokenAddresses[TsTokenId.USDT]
    );
  });

  describe("Register with ERC20", function () {
    beforeEach(async () => {
      const amount = utils.parseUnits(
        MIN_DEPOSIT_AMOUNT.USDT.toString(),
        TS_BASE_TOKEN.USDT.decimals
      );
      await usdt.connect(user1).mint(user1Addr, amount);
      await usdt.connect(user1).approve(zkTrueUp.address, amount);
    });

    it("Success to register", async function () {
      // before register
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeAccountNum = await diamondAcc.getAccountNum();
      const [, , beforeTotalPendingRequests] =
        await diamondRollup.getL1RequestNum();

      // call register
      const amount = utils.parseUnits(
        MIN_DEPOSIT_AMOUNT.USDT.toString(),
        TS_BASE_TOKEN.USDT.decimals
      );

      const chainId = Number((await user1.getChainId()).toString());
      const tsSigner = await getTsRollupSignerFromWallet(
        chainId,
        diamondAcc.address,
        user1 as Wallet
      );
      const tsPubKey = {
        X: tsSigner.tsPubKey[0].toString(),
        Y: tsSigner.tsPubKey[1].toString(),
      };

      await diamondAcc
        .connect(user1)
        .register(tsPubKey.X, tsPubKey.Y, usdt.address, amount);

      // check balance
      const afterZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      expect(afterZkTrueUpUsdtBalance.sub(beforeZkTrueUpUsdtBalance)).to.be.eq(
        amount
      );

      // check accountNum increased
      const afterAccountNum = await diamondAcc.getAccountNum();
      expect(afterAccountNum - beforeAccountNum).to.be.eq(1);

      // check totalPendingRequest increased
      const [, , afterTotalPendingRequests] =
        await diamondRollup.getL1RequestNum();
      expect(
        afterTotalPendingRequests.sub(beforeTotalPendingRequests)
      ).to.be.eq(2);

      // check the request is existed in the L1 request queue
      const accountId = await diamondAcc.getAccountId(user1Addr);
      const l2TokenAddr = await diamondToken.getTokenId(usdt.address);
      const register = {
        accountId: accountId,
        tsAddr: genTsAddr(
          BigNumber.from(tsPubKey.X),
          BigNumber.from(tsPubKey.Y)
        ),
      };
      const [, , totalL1RequestNum] = await diamondRollup.getL1RequestNum();
      let requestId = totalL1RequestNum.sub(2);
      let success = await diamondRollup.isRegisterInL1RequestQueue(
        register,
        requestId
      );
      expect(success).to.be.true;
      const l2Amt = toL2Amt(amount, TS_BASE_TOKEN.USDT);

      const deposit = {
        accountId: accountId,
        tokenId: l2TokenAddr,
        amount: l2Amt,
      };
      requestId = totalL1RequestNum.sub(1);
      success = await diamondRollup.isDepositInL1RequestQueue(
        deposit,
        requestId
      );
      expect(success).to.be.true;
    });

    it("Failed to register, the deposited token have not be whitelisted", async function () {
      // call register
      const amount = utils.parseUnits("100", TS_BASE_TOKEN.USDT.decimals);

      const invalidAddr = ethers.Wallet.createRandom().address;

      const chainId = Number((await user1.getChainId()).toString());
      const tsSigner = await getTsRollupSignerFromWallet(
        chainId,
        diamondAcc.address,
        user1 as Wallet
      );
      const tsPubKey = {
        X: tsSigner.tsPubKey[0].toString(),
        Y: tsSigner.tsPubKey[1].toString(),
      };

      await usdt.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        diamondAcc
          .connect(user1)
          .register(tsPubKey.X, tsPubKey.Y, invalidAddr, amount)
      ).to.be.revertedWithCustomError(diamondAcc, "TokenIsNotExist");
    });

    it("Failed to register, the deposit amount less than the minimum deposit amount", async function () {
      // call register
      const amount = utils.parseUnits(
        MIN_DEPOSIT_AMOUNT.USDT.toString(),
        TS_BASE_TOKEN.USDT.decimals
      );

      // invalid amount
      const invalidAmt = amount.sub(1);

      const chainId = Number((await user1.getChainId()).toString());
      const tsSigner = await getTsRollupSignerFromWallet(
        chainId,
        diamondAcc.address,
        user1 as Wallet
      );
      const tsPubKey = {
        X: tsSigner.tsPubKey[0].toString(),
        Y: tsSigner.tsPubKey[1].toString(),
      };

      await expect(
        diamondAcc
          .connect(user1)
          .register(tsPubKey.X, tsPubKey.Y, usdt.address, invalidAmt)
      ).to.be.revertedWithCustomError(diamondAcc, "InvalidDepositAmt");
    });
  });

  describe("Register with ETH", function () {
    it("Success to register", async function () {
      // before register
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeAccountNum = await diamondAcc.getAccountNum();
      const [, , beforeTotalPendingRequests] =
        await diamondRollup.getL1RequestNum();

      const chainId = Number((await user1.getChainId()).toString());
      const tsSigner = await getTsRollupSignerFromWallet(
        chainId,
        diamondAcc.address,
        user1 as Wallet
      );
      const tsPubKey = {
        X: tsSigner.tsPubKey[0].toString(),
        Y: tsSigner.tsPubKey[1].toString(),
      };

      // call register
      const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      // await weth.connect(user1).approve(zkTrueUp.address, amount);
      await diamondAcc
        .connect(user1)
        .register(tsPubKey.X, tsPubKey.Y, DEFAULT_ETH_ADDRESS, amount, {
          value: amount,
        });

      // after register
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterAccountNum = await diamondAcc.getAccountNum();
      const [, , afterTotalPendingRequests] =
        await diamondRollup.getL1RequestNum();

      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.be.eq(
        amount
      );
      expect(afterAccountNum - beforeAccountNum).to.be.eq(1);
      expect(
        afterTotalPendingRequests.sub(beforeTotalPendingRequests)
      ).to.be.eq(2);

      // check the request is existed in the L1 request queue
      const accountId = await diamondAcc.getAccountId(user1Addr);
      const l2TokenAddr = await diamondToken.getTokenId(DEFAULT_ETH_ADDRESS);
      const register = {
        accountId: accountId,
        tsAddr: genTsAddr(
          BigNumber.from(tsPubKey.X),
          BigNumber.from(tsPubKey.Y)
        ),
      };
      const [, , totalL1RequestNum] = await diamondRollup.getL1RequestNum();
      let requestId = totalL1RequestNum.sub(2);
      let success = await diamondRollup.isRegisterInL1RequestQueue(
        register,
        requestId
      );
      expect(success).to.be.true;

      const l2Amt = toL2Amt(amount, TS_BASE_TOKEN.ETH);
      const deposit = {
        accountId: accountId,
        tokenId: l2TokenAddr,
        amount: l2Amt,
      };
      const [, , totalL1RequestNum2] = await diamondRollup.getL1RequestNum();
      requestId = totalL1RequestNum2.sub(1);
      success = await diamondRollup.isDepositInL1RequestQueue(
        deposit,
        requestId
      );
      expect(success).to.be.true;
    });

    it("Failed to register, the deposit amount less than the minimum deposit amount", async function () {
      // call register
      const chainId = Number((await user1.getChainId()).toString());
      const tsSigner = await getTsRollupSignerFromWallet(
        chainId,
        diamondAcc.address,
        user1 as Wallet
      );
      const tsPubKey = {
        X: tsSigner.tsPubKey[0].toString(),
        Y: tsSigner.tsPubKey[1].toString(),
      };
      const amount = utils.parseEther((MIN_DEPOSIT_AMOUNT.ETH / 2).toString());
      expect(
        diamondAcc
          .connect(user1)
          .register(tsPubKey.X, tsPubKey.Y, DEFAULT_ETH_ADDRESS, amount, {
            value: amount,
          })
      ).to.be.revertedWithCustomError(diamondAcc, "InvalidDepositAmt");
    });
  });
});

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { BaseTokenAddresses } from "../../utils/type";
import { deployAndInit } from "../utils/deployAndInit";
import { whiteListBaseTokens } from "../utils/whitelistToken";
import { useFacet } from "../../utils/useFacet";
import { FACET_NAMES } from "../../utils/config";
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

describe("Force withdraw", function () {
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
    diamondAcc = (await useFacet("AccountFacet", zkTrueUp)) as AccountFacet;
    diamondRollup = (await useFacet("RollupFacet", zkTrueUp)) as RollupFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUp)) as TokenFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    usdt = await ethers.getContractAt(
      "ERC20Mock",
      baseTokenAddresses[TsTokenId.USDT]
    );
  });

  describe("ForceWithdraw with ETH", function () {
    it("Success to forceWithdraw with ETH", async function () {
      // register user1
      const tsPubKey = { X: BigNumber.from("3"), Y: BigNumber.from("4") };
      const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await weth.connect(user1).approve(zkTrueUp.address, amount);
      await diamondAcc
        .connect(user1)
        .register(tsPubKey.X, tsPubKey.Y, DEFAULT_ETH_ADDRESS, amount, {
          value: amount,
        });

      const tokenAddr = DEFAULT_ETH_ADDRESS;
      await diamondAcc.connect(user1).forceWithdraw(tokenAddr);
      // check the request is existed in the L1 request queue
      const accountId = await diamondAcc.getAccountId(user1Addr);
      const tokenId = await diamondToken.getTokenId(tokenAddr);
      const forceWithdraw = {
        accountId: accountId,
        tokenId: tokenId,
        amount: BigNumber.from(0),
      };
      const requestId = (
        await diamondRollup.getL1RequestNum()
      ).totalL1RequestNum.sub(1);
      const success = await diamondRollup.isForceWithdrawInL1RequestQueue(
        forceWithdraw,
        requestId
      );
      expect(success).to.be.true;
    });

    it("Failed to forceWithdraw, forceWithdraw with ETH but the account is not registered", async function () {
      const tokenAddr = DEFAULT_ETH_ADDRESS;
      expect(
        diamondAcc.connect(user1).forceWithdraw(tokenAddr)
      ).to.be.revertedWithCustomError(diamondAcc, "AccountIsNotRegistered");
    });
  });

  describe("ForceWithdraw with ERC20", function () {
    it("Success to forceWithdraw with ERC20", async function () {
      // register user1
      const tsPubKey = { X: BigNumber.from("3"), Y: BigNumber.from("4") };
      const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await weth.connect(user1).approve(zkTrueUp.address, amount);
      await diamondAcc
        .connect(user1)
        .register(tsPubKey.X, tsPubKey.Y, DEFAULT_ETH_ADDRESS, amount, {
          value: amount,
        });

      const tokenAddr = usdt.address;
      await diamondAcc.connect(user1).forceWithdraw(tokenAddr);
      // check the request is existed in the L1 request queue
      const accountId = await diamondAcc.getAccountId(user1Addr);
      const tokenId = await diamondToken.getTokenId(tokenAddr);
      const forceWithdraw = {
        accountId: accountId,
        tokenId: tokenId,
        amount: BigNumber.from(0),
      };
      const requestId = (
        await diamondRollup.getL1RequestNum()
      ).totalL1RequestNum.sub(1);
      const success = await diamondRollup.isForceWithdrawInL1RequestQueue(
        forceWithdraw,
        requestId
      );
      expect(success).to.be.true;
    });

    it("Failed to forceWithdraw, forceWithdraw with ERC20 but the account is not registered", async function () {
      const tokenAddr = usdt.address;
      expect(
        diamondAcc.connect(user1).forceWithdraw(tokenAddr)
      ).to.be.revertedWithCustomError(diamondAcc, "AccountIsNotRegistered");
    });

    it("Failed to forceWithdraw, forceWithdraw with ERC20 but the token is not exist", async function () {
      // register user1
      const tsPubKey = { X: BigNumber.from("3"), Y: BigNumber.from("4") };
      const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
      await weth.connect(user1).approve(zkTrueUp.address, amount);
      await diamondAcc
        .connect(user1)
        .register(tsPubKey.X, tsPubKey.Y, DEFAULT_ETH_ADDRESS, amount, {
          value: amount,
        });

      const randAddr = ethers.Wallet.createRandom().address;
      expect(
        diamondAcc.connect(user1).forceWithdraw(randAddr)
      ).to.be.revertedWithCustomError(diamondToken, "TokenIsNotExist");
    });
  });
});

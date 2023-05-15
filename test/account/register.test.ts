import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { deployAndInit } from "../utils/deployAndInit";
import { whiteListBaseTokens } from "../utils/whitelistToken";
import {
  ERC20Mock,
  GovernanceFacet,
  TokenFacet,
  WETH9,
  ZkTrueUp,
} from "../../typechain-types";
import { BigNumber, Signer } from "ethers";
import { BaseTokenAddr } from "../../utils/type";
import { MIN_DEPOSIT_AMOUNT, TsTokenId } from "term-structure-sdk";

const deployFixture = async () => {
  const res = await deployAndInit();
  await whiteListBaseTokens(
    res.baseTokenAddresses,
    res.priceFeeds,
    res.facets["TokenFacet"] as TokenFacet,
    res.operator
  );
  return res;
};

describe("Register", function () {
  let user1: Signer;
  let weth: WETH9;
  let operator: Signer;
  let governance: GovernanceFacet;
  let zkTrueUp: ZkTrueUp;
  let viewer: Viewer;
  let baseTokenAddresses: BaseTokenAddr;
  let usdt: ERC20Mock;

  beforeEach(async function () {
    const res = await loadFixture(deployFixture);
    user1 = await ethers.getSigner(1);
    weth = res.facets["WETH9"] as WETH9;
    governance = res.facets["GovernanceFacet"] as GovernanceFacet;
    zkTrueUp = res.facets["ZkTrueUp"] as ZkTrueUp;
    viewer = res.viewer;
    operator = res.operator;
    baseTokenAddresses = res.baseTokenAddresses;
    usdt = await ethers.getContractAt(
      "ERC20Mock",
      baseTokenAddresses[TsTokenId.USDT]
    );
  });

  describe("Register with ERC20", function () {
    const tsPubKey = { X: BigNumber.from("3"), Y: BigNumber.from("4") };
    let USDT_minDepositAmt: BigNumber;

    beforeEach(async () => {
      USDT_minDepositAmt = BigNumber.from(MIN_DEPOSIT_AMOUNT.USDT).mul(
        BigNumber.from(10).pow(await usdt.decimals())
      );
      await usdt
        .connect(user1)
        .mint(await user1.getAddress(), USDT_minDepositAmt);
      await usdt.connect(user1).approve(zkTrueUp.address, USDT_minDepositAmt);
    });

    it("Legal register", async function () {
      const diamondAcc = await ethers.getContractAt(
        "AccountFacet",
        zkTrueUp.address
      );
      // const changeFacet = (facet: string) => {
      //   return async () => {
      //     const newFacet = await ethers.getContractAt(facet, zkTrueUp.address);
      //     return newFacet;
      //   };
      // };
      // before register
      const beforeZkTrueUpUsdtBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeAccountNum = await diamondAcc.getAccountNum();
      const diamondRollup = await ethers.getContractAt(
        "RollupFacet",
        zkTrueUp.address
      );
      const beforeTotalPendingRequests = (await diamondRollup.getL1RequestNum())
        .totalL1RequestNum;

      // call register
      const amount = USDT_minDepositAmt;
      await zkTrueUp
        .connect(user1)
        .register(tsPubKey.X, tsPubKey.Y, usdt.address, amount);

      // check user1 balance
      const newBalance = await usdt.balanceOf(zkTrueUp.address);
      expect(newBalance.sub(oriBalance)).to.be.eq(amount);

      // check accountNum increased
      const newAccountNum = await zkTrueUp.getAccountNum();
      expect(newAccountNum - oriAccountNum).to.be.eq(1);

      // check totalPendingRequest increased
      const newTotalPendingRequests = (await zkTrueUp.getL1RequestNum())
        .totalL1RequestNum;
      expect(newTotalPendingRequests.sub(oriTotalPendingRequests)).to.be.eq(2);

      // check the request is existed in the L1 request queue
      const accountId = await zkTrueUp.getAccountId(await user1.getAddress());
      const l2TokenAddr = await governance.getTokenId(usdt.address);
      const register = {
        accountId: accountId,
        tsAddr: genTsAddr(tsPubKey.X, tsPubKey.Y),
      };
      const totalL1RequestNum = (await zkTrueUp.getL1RequestNum())
        .totalL1RequestNum;
      let requestId = totalL1RequestNum.sub(2);
      let success = await viewer.isRegisterInL1RequestQueue(
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
      success = await viewer.isDepositInL1RequestQueue(deposit, requestId);
      expect(success).to.be.true;
    });

    it("Illegal Register - The deposit token needs to be whitelisted", async function () {
      // call register
      const amount = MIN_DEPOSIT_AMOUNT.USDT * 10 ** (await usdt.decimals());

      const randAddr = "0x1234567890123456789012345678901234567890";
      const nonWhitelistToken = await ethers.getContractAt(
        "ERC20FreeMint",
        randAddr
      );

      const governanceError = await ethers.getContractFactory(
        "GovernanceError"
      );
      await usdt.connect(user1).approve(zkTrueUp.address, amount);
      await expect(
        zkTrueUp
          .connect(user1)
          .register(tsPubKey.X, tsPubKey.Y, nonWhitelistToken.address, amount)
      ).to.be.revertedWithCustomError(governanceError, "TokenIsNotExist");
    });

    it("Illegal Register - The deposit amount needs to be greater than the minimum deposit notional", async function () {
      const USDT_minDepositAmt =
        MIN_DEPOSIT_AMOUNT.USDT * 10 ** (await usdt.decimals());
      // call register
      const zkTrueUpError = await ethers.getContractFactory("ZkTrueUpError");
      const amount = BigNumber.from(USDT_minDepositAmt).sub("1");

      await expect(
        zkTrueUp
          .connect(user1)
          .register(tsPubKey.X, tsPubKey.Y, usdt.address, amount)
      ).to.be.revertedWithCustomError(zkTrueUpError, "InvalidDepositAmt");
    });
  });

  // describe("Register with ETH", function () {
  //   it("Legal register", async function () {
  //     // get user1's states first
  //     const oriBalance = await weth.balanceOf(zkTrueUp.address);
  //     const oriAccountNum = await zkTrueUp.getAccountNum();
  //     const oriTotalPendingRequests = (await zkTrueUp.getL1RequestNum())
  //       .totalL1RequestNum;

  //     // call register
  //     const tsPubKey = { X: BigNumber.from("3"), Y: BigNumber.from("4") };
  //     const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
  //     // await weth.connect(user1).approve(zkTrueUp.address, amount);
  //     await zkTrueUp
  //       .connect(user1)
  //       .register(tsPubKey.X, tsPubKey.Y, DEFAULT_ETH_ADDRESS, amount, {
  //         value: amount,
  //       });

  //     // check user1 balance
  //     const newBalance = await weth.balanceOf(zkTrueUp.address);
  //     expect(newBalance.sub(oriBalance)).to.be.eq(amount);

  //     // check accountNum increased
  //     const newAccountNum = await zkTrueUp.getAccountNum();
  //     expect(newAccountNum - oriAccountNum).to.be.eq(1);

  //     // check totalPendingRequest increased
  //     const newTotalPendingRequests = (await zkTrueUp.getL1RequestNum())
  //       .totalL1RequestNum;
  //     expect(newTotalPendingRequests.sub(oriTotalPendingRequests)).to.be.eq(2);

  //     // check the request is existed in the L1 request queue
  //     const accountId = await zkTrueUp.getAccountId(await user1.getAddress());
  //     const l2TokenAddr = await governance.getTokenId(DEFAULT_ETH_ADDRESS);
  //     const register = {
  //       accountId: accountId,
  //       tsAddr: genTsAddr(tsPubKey.X, tsPubKey.Y),
  //     };
  //     let requestId = (await zkTrueUp.getL1RequestNum()).totalL1RequestNum.sub(
  //       2
  //     );
  //     let success = await viewer.isRegisterInL1RequestQueue(
  //       register,
  //       requestId
  //     );
  //     expect(success).to.be.true;

  //     const l2Amt = toL2Amt(amount, TS_BASE_TOKEN.ETH);
  //     const deposit = {
  //       accountId: accountId,
  //       tokenId: l2TokenAddr,
  //       amount: l2Amt,
  //     };
  //     requestId = (await zkTrueUp.getL1RequestNum()).totalL1RequestNum.sub(1);
  //     success = await viewer.isDepositInL1RequestQueue(deposit, requestId);
  //     expect(success).to.be.true;
  //   });

  //   it("Illegal Register - The deposit amount needs to be greater than the minimum deposit notional", async function () {
  //     // call register
  //     const tsPubKey = { X: BigNumber.from("3"), Y: BigNumber.from("4") };
  //     const amount = utils.parseEther((MIN_DEPOSIT_AMOUNT.ETH / 2).toString());
  //     // await weth.connect(user1).approve(zkTrueUp.address, amount);
  //     const zkTrueUpError = await ethers.getContractFactory("ZkTrueUpError");
  //     expect(
  //       zkTrueUp
  //         .connect(user1)
  //         .register(tsPubKey.X, tsPubKey.Y, DEFAULT_ETH_ADDRESS, amount, {
  //           value: amount,
  //         })
  //     ).to.be.revertedWithCustomError(zkTrueUpError, "InvalidDepositAmt");
  //   });
  // });
});

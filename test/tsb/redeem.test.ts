import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../utils/deployAndInit";
import { useFacet } from "../../utils/useFacet";
import { register } from "../utils/register";
import { BaseTokenAddresses, PriceFeeds } from "../../utils/type";
import { maturedTsbTokensJSON, tsbTokensJSON } from "../data/tsbTokens";
import { whiteListBaseTokens } from "../utils/whitelistToken";
import { TS_BASE_TOKEN, TS_DECIMALS, TsTokenId } from "term-structure-sdk";
import { DEFAULT_ZERO_ADDR } from "../../utils/config";
import { baseTokensJSON } from "../data/baseTokens";
import {
  AccountFacet,
  ERC20Mock,
  TokenFacet,
  TsbFacet,
  TsbLib,
  TsbToken,
  ZkTrueUp,
} from "../../typechain-types";

//! use AccountMock and TsbMock for testing
export const FACET_NAMES_MOCK = [
  "AccountMock", // replace AccountFacet with AccountMock
  "AddressFacet",
  "FlashLoanFacet",
  "GovernanceFacet",
  "LoanFacet",
  "RollupFacet",
  "TokenFacet",
  "TsbMock", // replace TsbFacet with TsbMock
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

describe("Redeem TsbToken", () => {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let priceFeeds: PriceFeeds;
  let diamondWithTsbLib: TsbLib;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    operator = res.operator;
    zkTrueUp = res.zkTrueUp;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUp)) as AccountFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUp)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUp)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    priceFeeds = res.priceFeeds;
    diamondWithTsbLib = await ethers.getContractAt("TsbLib", zkTrueUp.address);
  });

  //! using TestTsbFactory ignore maturity limit and testTsbTokensJSON to test
  describe("Redeem TSB token", () => {
    beforeEach(async () => {
      // create tsb tokens
      for (let i = 0; i < maturedTsbTokensJSON.length; i++) {
        const underlyingTokenId = maturedTsbTokensJSON[i].underlyingTokenId;
        const maturity = BigNumber.from(maturedTsbTokensJSON[i].maturity);
        const name = maturedTsbTokensJSON[i].name;
        const symbol = maturedTsbTokensJSON[i].symbol;
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
          isStableCoin: maturedTsbTokensJSON[i].isStableCoin,
          isTsbToken: true,
          decimals: TS_DECIMALS.AMOUNT,
          minDepositAmt: maturedTsbTokensJSON[i].minDepositAmt,
          tokenAddr: tsbTokenAddr,
          priceFeed: DEFAULT_ZERO_ADDR,
        };
        await diamondToken.connect(operator).addToken(assetConfig);
      }

      // get params
      const tokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);

      // register
      const registerAmt = utils.parseUnits(
        "1",
        baseTokensJSON[tokenId].decimals
      );
      await register(
        user1,
        tokenId,
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // transfer default amount to zkTrueUp
      const amount = utils.parseEther("1");
      const underlyingAssetAddr = baseTokenAddresses[tokenId];
      const baseToken = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;
      await (
        await baseToken.connect(operator).mint(zkTrueUp.address, amount)
      ).wait();

      // withdraw tsb token
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(tokenId, maturity);
      await (
        await diamondAcc.connect(user1).withdraw(tsbTokenAddr, amount)
      ).wait(); //! ignore _withdraw in AccountMock
    });

    it("Success to redeem tsb token (tsbUSDC case)", async () => {
      // get params tsbUSDC
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      const amount = utils.parseUnits("500", TS_BASE_TOKEN.USDC.decimals);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
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
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // redeem tsb token
      const redeemTx = await diamondTsb
        .connect(user1)
        .redeem(tsbTokenAddr, amount, false);
      await redeemTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsb.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsb.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check event
      await expect(redeemTx)
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
      expect(beforeZkTrueUpUsdcBalance.sub(afterZkTrueUpUsdcBalance)).to.equal(
        amount
      );
      expect(afterUser1UsdcBalance.sub(beforeUser1UsdcBalance)).to.equal(
        amount
      );
    });

    it("Fail to redeem tsb token, invalid token address", async () => {
      // invalid tsb token address but whitelisted token
      const invalidTsbTokenAddr = baseTokenAddresses[TsTokenId.ETH];
      const amount = utils.parseEther("0.5");

      // redeem tsb token with invalid token address
      await expect(
        diamondTsb.connect(user1).redeem(invalidTsbTokenAddr, amount, false)
      ).to.be.revertedWithCustomError(diamondTsb, "InvalidTsbTokenAddr");
    });

    it("Fail to redeem tsb token, tsb token is not matured", async () => {
      // get params
      const underlyingTokenId = maturedTsbTokensJSON[1].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[1].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      const amount = utils.parseEther("0.5");

      // redeem tsb token not matured
      await expect(
        diamondTsb.connect(user1).redeem(tsbTokenAddr, amount, false)
      ).to.be.revertedWithCustomError(diamondTsb, "TsbTokenIsNotMatured");
    });
  });

  describe("Redeem and deposit tsb token", () => {
    beforeEach(async () => {
      // create tsb tokens
      for (let i = 0; i < maturedTsbTokensJSON.length; i++) {
        const underlyingTokenId = maturedTsbTokensJSON[i].underlyingTokenId;
        const maturity = BigNumber.from(maturedTsbTokensJSON[i].maturity);
        const name = maturedTsbTokensJSON[i].name;
        const symbol = maturedTsbTokensJSON[i].symbol;
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
          isStableCoin: maturedTsbTokensJSON[i].isStableCoin,
          isTsbToken: true,
          decimals: TS_DECIMALS.AMOUNT,
          minDepositAmt: maturedTsbTokensJSON[i].minDepositAmt,
          tokenAddr: tsbTokenAddr,
          priceFeed: DEFAULT_ZERO_ADDR,
        };
        await diamondToken.connect(operator).addToken(assetConfig);
      }

      // get params
      const tokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);

      // register
      const registerAmt = utils.parseUnits(
        "10",
        baseTokensJSON[tokenId].decimals
      );
      await register(
        user1,
        tokenId,
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // transfer default amount to zkTrueUp
      const amount = utils.parseEther("1");
      const underlyingAssetAddr = baseTokenAddresses[tokenId];
      const baeToken = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;
      await (
        await baeToken.connect(operator).mint(zkTrueUp.address, amount)
      ).wait(); // mint to zkTrueUp

      // withdraw tsb token
      const tsbTokenAmt = utils.parseUnits("500", TS_DECIMALS.AMOUNT);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(tokenId, maturity);
      await (
        await diamondAcc.connect(user1).withdraw(tsbTokenAddr, tsbTokenAmt)
      ).wait(); //! ignore _withdraw in AccountMock
    });

    it("Success to redeem tsb token and deposit", async () => {
      // get params tsbUSDC
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      const amount = utils.parseUnits("500", TS_BASE_TOKEN.USDC.decimals);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
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
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // redeem tsb token for deposit
      const redeemAndDepositTx = await diamondTsb
        .connect(user1)
        .redeem(tsbTokenAddr, amount, true);
      await redeemAndDepositTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsb.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsb.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check event
      await expect(redeemAndDepositTx)
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
      expect(beforeZkTrueUpUsdcBalance).to.equal(afterZkTrueUpUsdcBalance);
      expect(beforeUser1UsdcBalance).to.equal(afterUser1UsdcBalance);
    });

    it("Fail to redeem tsb token for deposit, invalid token address", async () => {
      // invalid tsb token address but whitelisted token
      const invalidTsbTokenAddr = baseTokenAddresses[TsTokenId.ETH];
      const amount = utils.parseUnits("500", TS_BASE_TOKEN.USDC.decimals);

      // redeem for deposit tsb token with invalid token address
      await expect(
        diamondTsb.connect(user1).redeem(invalidTsbTokenAddr, amount, true)
      ).to.be.revertedWithCustomError(diamondTsb, "InvalidTsbTokenAddr");
    });

    it("Fail to redeem tsb token for deposit, tsb token is not matured", async () => {
      // get params
      const underlyingTokenId = maturedTsbTokensJSON[2].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[2].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      const amount = utils.parseUnits("500", TS_BASE_TOKEN.USDC.decimals);

      // redeem for deposit tsb token with invalid token address
      await expect(
        diamondTsb.connect(user1).redeem(tsbTokenAddr, amount, true)
      ).to.be.revertedWithCustomError(diamondTsb, "TsbTokenIsNotMatured");
    });

    it("Fail to redeem tsb token for deposit, not a registered account", async () => {
      // get params
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      const amount = utils.parseUnits("500", TS_BASE_TOKEN.USDC.decimals);
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      await (await tsbToken.connect(user1).transfer(user2Addr, amount)).wait();

      // redeem for deposit tsb token with invalid token address
      await expect(
        diamondTsb.connect(user2).redeem(tsbTokenAddr, amount, true)
      ).to.be.revertedWithCustomError(diamondTsb, "AccountIsNotRegistered");
    });
  });
});

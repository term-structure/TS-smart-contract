const helpers = require("@nomicfoundation/hardhat-network-helpers");
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  BigNumber,
  Signer,
  TypedDataDomain,
  TypedDataField,
  utils,
} from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { register } from "../../utils/register";
import { BaseTokenAddresses, PriceFeeds } from "../../../utils/type";
import { maturedTsbTokensJSON, tsbTokensJSON } from "../../data/tsbTokens";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { TS_BASE_TOKEN, TS_DECIMALS, TsTokenId } from "term-structure-sdk";
import { DEFAULT_ZERO_ADDR } from "../../../utils/config";
import { baseTokensJSON } from "../../data/baseTokens";
import {
  AccountMock,
  ERC20Mock,
  TokenFacet,
  TsbLib,
  TsbMock,
  TsbToken,
  ZkTrueUp,
} from "../../../typechain-types";
import { toL1Amt } from "../../utils/amountConvertor";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

//! use AccountMock and TsbMock for testing
export const FACET_NAMES_MOCK = [
  "AccountMock", // replace AccountFacet with AccountMock
  "AddressFacet",
  "FlashLoanFacet",
  "ProtocolParamsFacet",
  "LoanFacet",
  "RollupFacet",
  "TokenFacet",
  "TsbMock", // replace TsbFacet with TsbMock
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

describe("Redeem TsbToken", () => {
  let [user1, user2]: SignerWithAddress[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let zkTrueUp: ZkTrueUp;
  let diamondAccMock: AccountMock;
  let diamondToken: TokenFacet;
  let diamondTsbMock: TsbMock;
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
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAccMock = (await useFacet(
      "AccountMock",
      zkTrueUpAddr
    )) as AccountMock;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsbMock = (await useFacet("TsbMock", zkTrueUpAddr)) as TsbMock;
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
          await diamondTsbMock
            .connect(operator)
            .createTsbToken(underlyingTokenId, maturity, name, symbol)
        ).wait();

        // whitelist tsb token
        const tsbTokenAddr = await diamondTsbMock.getTsbToken(
          underlyingTokenId,
          maturity
        );
        const assetConfig = {
          isStableCoin: maturedTsbTokensJSON[i].isStableCoin,
          isTsbToken: true,
          decimals: TS_DECIMALS.AMOUNT,
          minDepositAmt: maturedTsbTokensJSON[i].minDepositAmt,
          token: tsbTokenAddr,
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
        diamondAccMock
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
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(tokenId, maturity);
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      await (
        await diamondAccMock
          .connect(user1)
          .withdraw(user1Addr, tsbTokenAddr, amount)
      ).wait(); //! ignore updateWithdrawalRecord in AccountMock
    });

    it("Success to redeem tsb token (tsbUSDC case)", async () => {
      // get params tsbUSDC
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const tsbUSDCAmt = utils.parseUnits("500", TS_DECIMALS.AMOUNT);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // increase time to after maturity
      await helpers.time.increaseTo(1672416600);
      // redeem tsb token
      const redeemTx = await diamondTsbMock
        .connect(user1)
        .redeem(user1Addr, tsbTokenAddr, tsbUSDCAmt, false);
      await redeemTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check event
      await expect(redeemTx)
        .to.emit(diamondWithTsbLib, "TsbTokenBurned")
        .withArgs(tsbTokenAddr, user1Addr, tsbUSDCAmt);

      // check tsb token amount
      expect(
        beforeUser1TsbTokenBalance.sub(afterUser1TsbTokenBalance)
      ).to.equal(tsbUSDCAmt);
      expect(beforeTsbTokenTotalSupply.sub(afterTsbTokenTotalSupply)).to.equal(
        tsbUSDCAmt
      );
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      expect(await tsbToken.balanceOf(zkTrueUp.address)).to.equal(0);

      // check underlying asset amount
      const underlyingAssetAmt = toL1Amt(tsbUSDCAmt, TS_BASE_TOKEN.USDC);
      expect(beforeZkTrueUpUsdcBalance.sub(afterZkTrueUpUsdcBalance)).to.equal(
        underlyingAssetAmt
      );
      expect(afterUser1UsdcBalance.sub(beforeUser1UsdcBalance)).to.equal(
        underlyingAssetAmt
      );
    });
    it("Success to delegate redeem tsb token (tsbUSDC case)", async () => {
      // get params tsbUSDC
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const tsbUSDCAmt = utils.parseUnits("500", TS_DECIMALS.AMOUNT);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // user1 delegate to user2
      const delegateTx = await diamondAccMock
        .connect(user1)
        .setDelegatee(user2Addr, true);
      await delegateTx.wait();

      // increase time after maturity
      await helpers.time.increaseTo(1672416600);
      // redeem tsb token
      const redeemTx = await diamondTsbMock
        .connect(user2)
        .redeem(user1Addr, tsbTokenAddr, tsbUSDCAmt, false);
      await redeemTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check event
      await expect(redeemTx)
        .to.emit(diamondWithTsbLib, "TsbTokenBurned")
        .withArgs(tsbTokenAddr, user1Addr, tsbUSDCAmt);

      // check tsb token amount
      expect(
        beforeUser1TsbTokenBalance.sub(afterUser1TsbTokenBalance)
      ).to.equal(tsbUSDCAmt);
      expect(beforeTsbTokenTotalSupply.sub(afterTsbTokenTotalSupply)).to.equal(
        tsbUSDCAmt
      );
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      expect(await tsbToken.balanceOf(zkTrueUp.address)).to.equal(0);

      // check underlying asset amount
      const underlyingAssetAmt = toL1Amt(tsbUSDCAmt, TS_BASE_TOKEN.USDC);
      expect(beforeZkTrueUpUsdcBalance.sub(afterZkTrueUpUsdcBalance)).to.equal(
        underlyingAssetAmt
      );
      expect(afterUser1UsdcBalance.sub(beforeUser1UsdcBalance)).to.equal(
        underlyingAssetAmt
      );
    });
    it("Success to permit redeem tsb token (tsbUSDC case)", async () => {
      // get params tsbUSDC
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const tsbUSDCAmt = utils.parseUnits("500", TS_DECIMALS.AMOUNT);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // user1 permit to user2
      const domain: TypedDataDomain = {
        name: "ZkTrueUp",
        version: "1",
        chainId: await user2.getChainId(),
        verifyingContract: zkTrueUp.address,
      };

      const types: Record<string, TypedDataField[]> = {
        Redeem: [
          { name: "delegatee", type: "address" },
          { name: "tsbToken", type: "address" },
          { name: "amount", type: "uint128" },
          { name: "redeemAndDeposit", type: "bool" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const deadline = BigNumber.from("4294967295");
      const value: Record<string, any> = {
        delegatee: user2Addr,
        tsbToken: tsbTokenAddr,
        amount: tsbUSDCAmt,
        redeemAndDeposit: false,
        nonce: await diamondAccMock.getNonce(user1Addr),
        deadline: deadline,
      };

      const signature = await user1._signTypedData(domain, types, value);
      const { v, r, s } = ethers.utils.splitSignature(signature);

      // increase time after maturity
      await helpers.time.increaseTo(1672416510);
      // redeem tsb token
      const redeemTx = await diamondTsbMock
        .connect(user2)
        .redeemPermit(
          user1Addr,
          tsbTokenAddr,
          tsbUSDCAmt,
          false,
          deadline,
          v,
          r,
          s
        );
      await redeemTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check event
      await expect(redeemTx)
        .to.emit(diamondWithTsbLib, "TsbTokenBurned")
        .withArgs(tsbTokenAddr, user1Addr, tsbUSDCAmt);

      // check tsb token amount
      expect(
        beforeUser1TsbTokenBalance.sub(afterUser1TsbTokenBalance)
      ).to.equal(tsbUSDCAmt);
      expect(beforeTsbTokenTotalSupply.sub(afterTsbTokenTotalSupply)).to.equal(
        tsbUSDCAmt
      );
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      expect(await tsbToken.balanceOf(zkTrueUp.address)).to.equal(0);

      // check underlying asset amount
      const underlyingAssetAmt = toL1Amt(tsbUSDCAmt, TS_BASE_TOKEN.USDC);
      expect(beforeZkTrueUpUsdcBalance.sub(afterZkTrueUpUsdcBalance)).to.equal(
        underlyingAssetAmt
      );
      expect(afterUser1UsdcBalance.sub(beforeUser1UsdcBalance)).to.equal(
        underlyingAssetAmt
      );
    });

    it("Fail to redeem tsb token, invalid token address", async () => {
      // invalid tsb token address but whitelisted token
      const invalidTsbTokenAddr = baseTokenAddresses[TsTokenId.ETH];
      const amount = utils.parseEther("0.5");

      // redeem tsb token with invalid token address
      await expect(
        diamondTsbMock
          .connect(user1)
          .redeem(user1Addr, invalidTsbTokenAddr, amount, false)
      ).to.be.revertedWithCustomError(diamondTsbMock, "InvalidTsbToken");
    });

    it("Fail to redeem tsb token, tsb token is not matured", async () => {
      // get params
      const underlyingTokenId = maturedTsbTokensJSON[1].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[1].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const amount = utils.parseEther("0.5");

      // redeem tsb token not matured
      await expect(
        diamondTsbMock
          .connect(user1)
          .redeem(user1Addr, tsbTokenAddr, amount, false)
      ).to.be.revertedWithCustomError(diamondTsbMock, "TsbTokenIsNotMatured");
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
          await diamondTsbMock
            .connect(operator)
            .createTsbToken(underlyingTokenId, maturity, name, symbol)
        ).wait();

        // whitelist tsb token
        const tsbTokenAddr = await diamondTsbMock.getTsbToken(
          underlyingTokenId,
          maturity
        );
        const assetConfig = {
          isStableCoin: maturedTsbTokensJSON[i].isStableCoin,
          isTsbToken: true,
          decimals: TS_DECIMALS.AMOUNT,
          minDepositAmt: maturedTsbTokensJSON[i].minDepositAmt,
          token: tsbTokenAddr,
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
        diamondAccMock
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
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(tokenId, maturity);
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      await (
        await diamondAccMock
          .connect(user1)
          .withdraw(user1Addr, tsbTokenAddr, tsbTokenAmt)
      ).wait(); //! ignore updateWithdrawalRecord in AccountMock
    });

    it("Success to redeem tsb token and deposit", async () => {
      // get params tsbUSDC
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const tsbUsdcAmt = utils.parseUnits("500", TS_DECIMALS.AMOUNT);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // increase time after maturity
      await helpers.time.increaseTo(1672416600);
      // redeem tsb token for deposit
      const redeemAndDepositTx = await diamondTsbMock
        .connect(user1)
        .redeem(user1Addr, tsbTokenAddr, tsbUsdcAmt, true);
      await redeemAndDepositTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check event
      await expect(redeemAndDepositTx)
        .to.emit(diamondWithTsbLib, "TsbTokenBurned")
        .withArgs(tsbTokenAddr, user1Addr, tsbUsdcAmt);

      // check tsb token amount
      expect(
        beforeUser1TsbTokenBalance.sub(afterUser1TsbTokenBalance)
      ).to.equal(tsbUsdcAmt);
      expect(beforeTsbTokenTotalSupply.sub(afterTsbTokenTotalSupply)).to.equal(
        tsbUsdcAmt
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

    it("Success to delegate redeem tsb token and deposit", async () => {
      // get params tsbUSDC
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const tsbUsdcAmt = utils.parseUnits("500", TS_DECIMALS.AMOUNT);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // user1 delegate to user2
      const delegateTx = await diamondAccMock
        .connect(user1)
        .setDelegatee(user2Addr, true);
      await delegateTx.wait();

      // increase time after maturity
      await helpers.time.increaseTo(1672416600);
      // redeem tsb token for deposit
      const redeemAndDepositTx = await diamondTsbMock
        .connect(user2)
        .redeem(user1Addr, tsbTokenAddr, tsbUsdcAmt, true);
      await redeemAndDepositTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check event
      await expect(redeemAndDepositTx)
        .to.emit(diamondWithTsbLib, "TsbTokenBurned")
        .withArgs(tsbTokenAddr, user1Addr, tsbUsdcAmt);

      // check tsb token amount
      expect(
        beforeUser1TsbTokenBalance.sub(afterUser1TsbTokenBalance)
      ).to.equal(tsbUsdcAmt);
      expect(beforeTsbTokenTotalSupply.sub(afterTsbTokenTotalSupply)).to.equal(
        tsbUsdcAmt
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

    it("Success to permit redeem tsb token and deposit", async () => {
      // get params tsbUSDC
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const tsbUsdcAmt = utils.parseUnits("500", TS_DECIMALS.AMOUNT);
      const underlyingAssetAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
        "ERC20Mock",
        underlyingAssetAddr
      )) as ERC20Mock;

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // user1 permit to user2
      const domain: TypedDataDomain = {
        name: "ZkTrueUp",
        version: "1",
        chainId: await user2.getChainId(),
        verifyingContract: zkTrueUp.address,
      };

      const types: Record<string, TypedDataField[]> = {
        Redeem: [
          { name: "delegatee", type: "address" },
          { name: "tsbToken", type: "address" },
          { name: "amount", type: "uint128" },
          { name: "redeemAndDeposit", type: "bool" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const deadline = BigNumber.from("4294967295");
      const value: Record<string, any> = {
        delegatee: user2Addr,
        tsbToken: tsbTokenAddr,
        amount: tsbUsdcAmt,
        redeemAndDeposit: true,
        nonce: await diamondAccMock.getNonce(user1Addr),
        deadline: deadline,
      };

      const signature = await user1._signTypedData(domain, types, value);
      const { v, r, s } = ethers.utils.splitSignature(signature);

      // increase time after maturity
      await helpers.time.increaseTo(1672416600);
      // redeem tsb token for deposit
      const redeemAndDepositTx = await diamondTsbMock
        .connect(user2)
        .redeemPermit(
          user1Addr,
          tsbTokenAddr,
          tsbUsdcAmt,
          true,
          deadline,
          v,
          r,
          s
        );
      await redeemAndDepositTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsbMock.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterTsbTokenTotalSupply = await diamondTsbMock.activeSupply(
        tsbTokenAddr
      );
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check event
      await expect(redeemAndDepositTx)
        .to.emit(diamondWithTsbLib, "TsbTokenBurned")
        .withArgs(tsbTokenAddr, user1Addr, tsbUsdcAmt);

      // check tsb token amount
      expect(
        beforeUser1TsbTokenBalance.sub(afterUser1TsbTokenBalance)
      ).to.equal(tsbUsdcAmt);
      expect(beforeTsbTokenTotalSupply.sub(afterTsbTokenTotalSupply)).to.equal(
        tsbUsdcAmt
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
        diamondTsbMock
          .connect(user1)
          .redeem(user1Addr, invalidTsbTokenAddr, amount, true)
      ).to.be.revertedWithCustomError(diamondTsbMock, "InvalidTsbToken");
    });

    it("Fail to redeem tsb token for deposit, tsb token is not matured", async () => {
      // get params
      const underlyingTokenId = maturedTsbTokensJSON[1].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[1].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const amount = utils.parseUnits("500", TS_BASE_TOKEN.USDC.decimals);

      // redeem for deposit tsb token with invalid token address
      await expect(
        diamondTsbMock
          .connect(user1)
          .redeem(user1Addr, tsbTokenAddr, amount, true)
      ).to.be.revertedWithCustomError(diamondTsbMock, "TsbTokenIsNotMatured");
    });

    it("Fail to redeem tsb token for deposit, not delegated caller", async () => {
      // get params
      const underlyingTokenId = maturedTsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(maturedTsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsbMock.getTsbToken(
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
        diamondTsbMock
          .connect(user2)
          .redeem(user1Addr, tsbTokenAddr, amount, true)
      ).to.be.revertedWithCustomError(diamondTsbMock, "InvalidCaller");
    });
  });
});

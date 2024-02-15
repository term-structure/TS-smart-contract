import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { BaseTokenAddresses } from "../../../utils/type";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { DEFAULT_ZERO_ADDR } from "../../../utils/config";
import { register } from "../../utils/register";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { baseTokensJSON } from "../../data/baseTokens";
import {
  AccountMock,
  ERC20Mock,
  TokenFacet,
  TsbFacet,
  TsbLib,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  DEFAULT_ETH_ADDRESS,
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

describe("Withdraw", () => {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAccMock: AccountMock;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let diamondWithTsbLib: TsbLib;
  const INVALID_TOKEN_ADDRESS = "0x1234567890123456789012345678901234567890";

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    operator = res.operator;
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAccMock = (await useFacet(
      "AccountMock",
      zkTrueUpAddr
    )) as AccountMock;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    diamondWithTsbLib = await ethers.getContractAt("TsbLib", zkTrueUp.address);
  });

  describe("Withdraw base token", () => {
    it("Success to withdraw base token (ETH case)", async () => {
      // register by ETH
      const registerAmt = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      await register(
        user1,
        Number(TS_BASE_TOKEN.ETH.tokenId),
        registerAmt,
        baseTokenAddresses,
        diamondAccMock
      );

      // before balance
      const beforeUser1EthBalance = await ethers.provider.getBalance(user1Addr);
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);

      // withdraw tsb token
      const amount = utils.parseEther("1");
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      const withdrawTx = await diamondAccMock
        .connect(user1)
        .withdraw(user1Addr, DEFAULT_ETH_ADDRESS, amount); //! ignore _withdraw in AccountMock
      const withdrawReceipt = await withdrawTx.wait();

      const withdrawGas = BigNumber.from(withdrawReceipt.gasUsed).mul(
        withdrawReceipt.effectiveGasPrice
      );

      // after balance
      const afterUser1EthBalance = await ethers.provider.getBalance(user1Addr);
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);

      // check balance
      expect(beforeUser1EthBalance.sub(withdrawGas).add(amount)).to.equal(
        afterUser1EthBalance
      );
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.equal(
        amount
      );
    });
    it("Success to withdraw base token (USDC case)", async () => {
      // register by USDC
      const amount = utils.parseUnits("10000", TS_BASE_TOKEN.USDC.decimals);
      await register(
        user1,
        Number(TS_BASE_TOKEN.USDC.tokenId),
        amount,
        baseTokenAddresses,
        diamondAccMock
      );

      const usdc = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDC]
      )) as ERC20Mock;

      // before balance
      const beforeUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const beforeZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // withdraw tsb token
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      const withdrawTx = await diamondAccMock
        .connect(user1)
        .withdraw(user1Addr, usdc.address, amount); //! ignore _withdraw in AccountMock
      await withdrawTx.wait();

      // after balance
      const afterUser1UsdcBalance = await usdc.balanceOf(user1Addr);
      const afterZkTrueUpUsdcBalance = await usdc.balanceOf(zkTrueUp.address);

      // check balance
      expect(beforeUser1UsdcBalance.add(amount)).to.equal(
        afterUser1UsdcBalance
      );
      expect(beforeZkTrueUpUsdcBalance.sub(afterZkTrueUpUsdcBalance)).to.equal(
        amount
      );
    });

    it("Fail to withdraw base token, invalid token address", async () => {
      // register by USDC
      const registerAmt = utils.parseUnits("10", TS_BASE_TOKEN.USDC.decimals);
      await register(
        user1,
        Number(TS_BASE_TOKEN.USDC.tokenId),
        registerAmt,
        baseTokenAddresses,
        diamondAccMock
      );

      // get params
      const invalidTokenAddr = INVALID_TOKEN_ADDRESS; // invalid token address (base token: eth)
      const amount = utils.parseEther("1");

      // withdraw tsb token with invalid token address
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      await expect(
        diamondAccMock
          .connect(user1)
          .withdraw(user1Addr, invalidTokenAddr, amount)
      ).to.be.revertedWithCustomError(diamondToken, "TokenIsNotExist");
    });

    it("Fail to withdraw base token, account address from input id is not msg.sender", async () => {
      const tokenAddr = DEFAULT_ETH_ADDRESS;
      const amount = utils.parseEther("1");

      // withdraw tsb token with invalid address
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      await expect(
        diamondAccMock.connect(user2).withdraw(user1Addr, tokenAddr, amount)
      ).to.be.revertedWithCustomError(diamondAccMock, "AccountIsNotRegistered");
    });
  });

  describe("Withdraw TSB token", () => {
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
        const tsbTokenAddr = await diamondTsb.getTsbToken(
          underlyingTokenId,
          maturity
        );
        const assetConfig = {
          isStableCoin: tsbTokensJSON[i].isStableCoin,
          isTsbToken: true,
          decimals: TS_DECIMALS.AMOUNT,
          minDepositAmt: tsbTokensJSON[i].minDepositAmt,
          token: tsbTokenAddr,
          priceFeed: DEFAULT_ZERO_ADDR,
        };
        await diamondToken.connect(operator).addToken(assetConfig);
      }
    });
    it("Success to withdraw tsb token (tsbETH case)", async () => {
      // get params, ETH case tokenId = 1
      const tokenId = tsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[0].maturity);

      // register by ETH
      const registerAmt = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      await register(
        user1,
        tokenId,
        registerAmt,
        baseTokenAddresses,
        diamondAccMock
      );

      // get tsb token address
      const tsbTokenAddr = await diamondTsb.getTsbToken(tokenId, maturity);

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsb.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      // withdraw tsb token
      const amount = utils.parseEther("1");
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      const withdrawTsbTokenTx = await diamondAccMock
        .connect(user1)
        .withdraw(user1Addr, tsbTokenAddr, amount); //! ignore updateWithdrawalRecord in AccountMock
      await withdrawTsbTokenTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsb.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);

      // check event
      await expect(withdrawTsbTokenTx)
        .to.emit(diamondWithTsbLib, "TsbTokenMinted")
        .withArgs(tsbTokenAddr, user1Addr, amount);

      // check balance
      expect(
        afterUser1TsbTokenBalance.sub(beforeUser1TsbTokenBalance)
      ).to.equal(amount);
      expect(beforeZkTrueUpWethBalance).to.equal(afterZkTrueUpWethBalance);
    });
    it("Success to withdraw tsb token (tsbUSDC case)", async () => {
      // get params tsbUSDC
      const underlyingTokenId = tsbTokensJSON[3].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[3].maturity);

      // register
      const registerAmt = utils.parseUnits(
        "10",
        baseTokensJSON[underlyingTokenId].decimals
      );
      await register(
        user1,
        underlyingTokenId,
        registerAmt,
        baseTokenAddresses,
        diamondAccMock
      );

      // transfer default amount to zkTrueUp
      const amount = utils.parseUnits("100", TS_BASE_TOKEN.USDC.decimals);
      const usdcAddr = baseTokenAddresses[underlyingTokenId];
      const usdc = (await ethers.getContractAt(
        "ERC20Mock",
        usdcAddr
      )) as ERC20Mock;
      await (
        await usdc.connect(operator).mint(zkTrueUp.address, amount)
      ).wait();

      // get tsb token address
      const tsbTokenAddr = await diamondTsb.getTsbToken(
        underlyingTokenId,
        maturity
      );

      // before balance
      const beforeUser1TsbTokenBalance = await diamondTsb.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const beforeZkTrueUpUnderlyingBalance = await usdc.balanceOf(
        zkTrueUp.address
      );

      // withdraw tsb token
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      const withdrawTsbTokenTx = await diamondAccMock
        .connect(user1)
        .withdraw(user1Addr, tsbTokenAddr, amount); //! ignore updateWithdrawalRecord in AccountMock
      await withdrawTsbTokenTx.wait();

      // after balance
      const afterUser1TsbTokenBalance = await diamondTsb.balanceOf(
        user1Addr,
        tsbTokenAddr
      );
      const afterZkTrueUpUnderlyingBalance = await usdc.balanceOf(
        zkTrueUp.address
      );

      const accId = await diamondAccMock.getAccountId(user1Addr);
      const tokenId = await diamondToken.getTokenId(tsbTokenAddr);

      // check event
      await expect(withdrawTsbTokenTx)
        .to.emit(diamondAccMock, "Withdrawal")
        .withArgs(user1Addr, user1Addr, accId, tsbTokenAddr, tokenId, amount);

      await expect(withdrawTsbTokenTx)
        .to.emit(diamondWithTsbLib, "TsbTokenMinted")
        .withArgs(tsbTokenAddr, user1Addr, amount);

      // check balance
      expect(
        afterUser1TsbTokenBalance.sub(beforeUser1TsbTokenBalance)
      ).to.equal(amount);
      expect(beforeZkTrueUpUnderlyingBalance).to.equal(
        afterZkTrueUpUnderlyingBalance
      );
    });

    it("Fail to withdraw tsb token, invalid token address", async () => {
      // get params tsbUSDC
      const tokenId = tsbTokensJSON[3].underlyingTokenId;

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

      // get params
      const invalidTsbTokenAddr = INVALID_TOKEN_ADDRESS; // invalid token address (base token: eth)
      const amount = utils.parseEther("1");

      // withdraw tsb token with invalid token address
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      await expect(
        diamondAccMock
          .connect(user1)
          .withdraw(user1Addr, invalidTsbTokenAddr, amount)
      ).to.be.revertedWithCustomError(diamondToken, "TokenIsNotExist");
    });

    it("Fail to withdraw tsb token, account address from input id is not msg.sender", async () => {
      // get params tsbUSDC
      const underlyingTokenId = tsbTokensJSON[3].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[3].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const amount = utils.parseEther("1");

      // withdraw tsb token with invalid address
      const user1Id = await diamondAccMock.getAccountId(user1Addr);
      await expect(
        diamondAccMock.connect(user2).withdraw(user1Addr, tsbTokenAddr, amount)
      ).to.be.revertedWithCustomError(diamondAccMock, "AccountIsNotRegistered");
    });
  });
});

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseEther } from "ethers/lib/utils";
import { BigNumber, Signer } from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import {
  AccountMock,
  TokenFacet,
  TsbFacet,
  TsbToken,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { BaseTokenAddresses } from "../../../utils/type";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { DEFAULT_ETH_ADDRESS, TS_DECIMALS } from "term-structure-sdk";
import { DEFAULT_ZERO_ADDR, FACET_NAMES } from "../../../utils/config";
import { register } from "../../utils/register";

//! use AccountMock instead of AccountFacet for testing
export const FACET_NAMES_MOCK = [
  "AccountMock", // replace AccountFacet with AccountMock
  "AddressFacet",
  "FlashLoanFacet",
  "GovernanceFacet",
  "LoanFacet",
  "RollupFacet",
  "TokenFacet",
  "TsbFacet",
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

describe("Ts Bond", () => {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let weth: WETH9;
  let diamondAccMock: AccountMock; // for testing
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let zkTrueUp: ZkTrueUp;
  let baseTokenAddresses: BaseTokenAddresses;
  const INVALID_CLASS_ID = 100;

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
    diamondAccMock = (await useFacet("AccountMock", zkTrueUp)) as AccountMock;
    diamondToken = (await useFacet("TokenFacet", zkTrueUp)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUp)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
  });
  describe("Create TSB Token", () => {
    it("Success to create tsb Token", async () => {
      for (let i = 0; i < tsbTokensJSON.length; i++) {
        // get params
        const underlyingTokenId = tsbTokensJSON[i].underlyingTokenId;
        const underlyingContractAddress =
          underlyingTokenId == 1
            ? DEFAULT_ETH_ADDRESS
            : baseTokenAddresses[underlyingTokenId];
        const maturity = BigNumber.from(tsbTokensJSON[i].maturity);
        const name = tsbTokensJSON[i].name;
        const symbol = tsbTokensJSON[i].symbol;

        // create tsb token
        const createTsbTokenTx = await diamondTsb
          .connect(operator)
          .createTsbToken(underlyingTokenId, maturity, name, symbol);
        const createTsbTokenReceipt = await createTsbTokenTx.wait();
        const addr = createTsbTokenReceipt.events?.[0].args?.[0];

        // check event
        await expect(createTsbTokenTx)
          .to.emit(diamondTsb, "TsbTokenCreated")
          .withArgs(addr, underlyingTokenId, maturity);

        // check tsb token
        const tsbToken = (await ethers.getContractAt(
          "TsbToken",
          addr
        )) as TsbToken;
        expect(await tsbToken.name()).to.equal(name);
        expect(await tsbToken.symbol()).to.equal(symbol);
        expect(await tsbToken.decimals()).to.equal(8);
        expect((await tsbToken.tokenInfo()).underlyingAsset).to.equal(
          underlyingContractAddress
        );
        expect((await tsbToken.tokenInfo()).maturityTime).to.equal(maturity);
      }
    });

    it("Fail to create tsb token, invalid caller", async () => {
      // get params
      const underlyingTokenId = tsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[0].maturity);
      const name = tsbTokensJSON[0].name;
      const symbol = tsbTokensJSON[0].symbol;

      // create tsb token with invalid caller
      await expect(
        diamondTsb
          .connect(user1)
          .createTsbToken(underlyingTokenId, maturity, name, symbol)
      ).to.be.reverted;
    });

    it("Fail to create tsb token, invalid maturity", async () => {
      // get params
      const underlyingTokenId = tsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from("1672329600"); // 2022-12-30
      const name = tsbTokensJSON[0].name;
      const symbol = tsbTokensJSON[0].symbol;

      // create tsb token with invalid maturity
      await expect(
        diamondTsb
          .connect(operator)
          .createTsbToken(underlyingTokenId, maturity, name, symbol)
      ).to.be.revertedWithCustomError(diamondTsb, "InvalidMaturityTime");
    });

    it("Fail to create tsb Token, invalid underlying token id", async () => {
      // get params
      const underlyingTokenId = INVALID_CLASS_ID; // invalid underlyingTokenId
      const maturity = BigNumber.from(tsbTokensJSON[1].maturity);
      const name = tsbTokensJSON[1].name;
      const symbol = tsbTokensJSON[1].symbol;

      // create tsb token with invalid underlyingTokenId
      await expect(
        diamondTsb
          .connect(operator)
          .createTsbToken(underlyingTokenId, maturity, name, symbol)
      ).to.be.revertedWithCustomError(diamondTsb, "UnderlyingAssetIsNotExist");
    });

    it("Fail to create tsb Token, tsb token is exist", async () => {
      // get params
      const underlyingTokenId = tsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[0].maturity);
      const name = tsbTokensJSON[0].name;
      const symbol = tsbTokensJSON[0].symbol;

      // create tsb token
      await (
        await diamondTsb
          .connect(operator)
          .createTsbToken(underlyingTokenId, maturity, name, symbol)
      ).wait();

      // try to create tsb token again
      await expect(
        diamondTsb
          .connect(operator)
          .createTsbToken(underlyingTokenId, maturity, name, symbol)
      ).to.be.revertedWithCustomError(diamondTsb, "TsbTokenIsExist");
    });
  });

  describe("View functions, tsb token info", () => {
    beforeEach(async () => {
      // create tsb tokens, tsbETH
      const underlyingTokenId = tsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[0].maturity);
      const name = tsbTokensJSON[2].name;
      const symbol = tsbTokensJSON[2].symbol;
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
        isStableCoin: tsbTokensJSON[0].isStableCoin,
        isTsbToken: true,
        decimals: TS_DECIMALS.AMOUNT,
        minDepositAmt: tsbTokensJSON[0].minDepositAmt,
        tokenAddr: tsbTokenAddr,
        priceFeed: DEFAULT_ZERO_ADDR,
      };
      await diamondToken.connect(operator).addToken(assetConfig);

      // register
      const registerAmt = parseEther("100");
      await register(
        user1,
        underlyingTokenId,
        registerAmt,
        baseTokenAddresses,
        diamondAccMock
      );

      // transfer default amount to zkTrueUp (ETH case)
      const amount = parseEther("1000");
      // mint to zkTrueUp
      await (await weth.connect(operator).deposit({ value: amount })).wait();
      await (
        await weth.connect(operator).transfer(zkTrueUp.address, amount)
      ).wait();
      // withdraw tsb token
      await (
        await diamondAccMock.connect(user1).withdraw(tsbTokenAddr, amount)
      ).wait(); //! ignore _updateWithdrawalRecord in AccountMock
    });
    it("Success to get balanceOf", async () => {
      // get params
      const underlyingTokenId = tsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      const amount = parseEther("1000");

      // check balanceOf
      expect(await diamondTsb.balanceOf(user1Addr, tsbTokenAddr)).to.equal(
        amount
      );
      expect(await tsbToken.balanceOf(user1Addr)).to.equal(amount);
    });

    it("Success to get allowance", async () => {
      // get params
      const underlyingTokenId = tsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      const amount = parseEther("500");
      await (await tsbToken.connect(user1).approve(user2Addr, amount)).wait();

      // check allowance
      expect(
        await diamondTsb.allowance(user1Addr, user2Addr, tsbTokenAddr)
      ).to.equal(amount);
      expect(await tsbToken.allowance(user1Addr, user2Addr)).to.equal(amount);
    });

    it("Success to get activeSupply", async () => {
      // get params
      const underlyingTokenId = tsbTokensJSON[0].underlyingTokenId;
      const maturity = BigNumber.from(tsbTokensJSON[0].maturity);
      const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
        underlyingTokenId,
        maturity
      );
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;
      const amount = parseEther("1000");

      // check active supply
      expect(await diamondTsb.activeSupply(tsbTokenAddr)).to.equal(amount);
      expect(await tsbToken.totalSupply()).to.equal(amount);
    });
  });

  describe("View function (get function)", () => {
    it("Success to get tsb tokenAddr", async () => {
      for (let i = 0; i < tsbTokensJSON.length; i++) {
        const underlyingTokenId = tsbTokensJSON[i].underlyingTokenId;
        const maturity = BigNumber.from(tsbTokensJSON[i].maturity);
        const name = tsbTokensJSON[i].name;
        const symbol = tsbTokensJSON[i].symbol;
        const createTsbTokenTx = await diamondTsb
          .connect(operator)
          .createTsbToken(underlyingTokenId, maturity, name, symbol);
        const createTsbTokenReceipt = await createTsbTokenTx.wait();
        const addr = createTsbTokenReceipt.events?.[0].args?.[0];

        // check getTsbTokenAddr
        expect(
          await diamondTsb.getTsbTokenAddr(underlyingTokenId, maturity)
        ).to.equal(addr);
      }
    });

    it("Success to get underlying asset", async () => {
      for (let i = 0; i < tsbTokensJSON.length; i++) {
        const underlyingTokenId = tsbTokensJSON[i].underlyingTokenId;
        const underlyingContractAddress =
          underlyingTokenId == 1
            ? DEFAULT_ETH_ADDRESS
            : baseTokenAddresses[underlyingTokenId];
        const maturity = BigNumber.from(tsbTokensJSON[i].maturity);
        const name = tsbTokensJSON[i].name;
        const symbol = tsbTokensJSON[i].symbol;
        await (
          await diamondTsb
            .connect(operator)
            .createTsbToken(underlyingTokenId, maturity, name, symbol)
        ).wait();
        const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
          underlyingTokenId,
          maturity
        );

        // check getUnderlyingAsset
        expect(await diamondTsb.getUnderlyingAsset(tsbTokenAddr)).to.equal(
          underlyingContractAddress
        );
      }
    });

    it("Success to get maturity time", async () => {
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
        const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
          underlyingTokenId,
          maturity
        );

        // check getMaturityTime
        expect(await diamondTsb.getMaturityTime(tsbTokenAddr)).to.equal(
          maturity
        );
      }
    });
  });
});

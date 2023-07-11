import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, Wallet, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { DEFAULT_ZERO_ADDR, FACET_NAMES } from "../../../utils/config";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";
import { tsbTokensJSON } from "../../data/tsbTokens";
import {
  TokenFacet,
  TsbFacet,
  TsbToken,
  ZkTrueUp,
} from "../../../typechain-types";

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

describe("TsbFactory", () => {
  let [user1]: Signer[] = [];
  let zkTrueUp: ZkTrueUp;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let admin: Signer;
  let operator: Signer;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1] = await ethers.getSigners();
    admin = res.admin;
    operator = res.operator;
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
  });
  describe("Add token", async () => {
    it("Success to add token (base token)", async () => {
      // before token number
      const beforeTokenNum = BigNumber.from(await diamondToken.getTokenNum());

      // new token config
      const assetConfig = {
        isStableCoin: false,
        isTsbToken: false,
        decimals: BigNumber.from(18),
        minDepositAmt: utils.parseEther("0.1"),
        token: Wallet.createRandom().address,
        priceFeed: Wallet.createRandom().address,
      };

      const addTokenTx = await diamondToken
        .connect(operator)
        .addToken(assetConfig);
      await addTokenTx.wait();

      const tokenId = await diamondToken.getTokenId(assetConfig.token);

      // after token number
      const afterTokenNum = BigNumber.from(await diamondToken.getTokenNum());

      // check token number
      expect(afterTokenNum).to.be.equal(beforeTokenNum.add(1));
      expect(afterTokenNum).to.be.equal(tokenId);

      // check token config
      const tokenConfig = await diamondToken.getAssetConfig(tokenId);
      expect(tokenConfig.isStableCoin).to.be.equal(assetConfig.isStableCoin);
      expect(tokenConfig.isTsbToken).to.be.equal(assetConfig.isTsbToken);
      expect(tokenConfig.decimals).to.be.equal(assetConfig.decimals);
      expect(tokenConfig.minDepositAmt).to.be.equal(assetConfig.minDepositAmt);
      expect(tokenConfig.token).to.be.equal(assetConfig.token);
      expect(tokenConfig.priceFeed).to.be.equal(assetConfig.priceFeed);

      // check event
      await expect(addTokenTx)
        .to.emit(diamondToken, "BaseTokenWhitelisted")
        .withArgs(assetConfig.token, afterTokenNum, [
          assetConfig.isStableCoin,
          assetConfig.isTsbToken,
          assetConfig.decimals,
          assetConfig.minDepositAmt,
          assetConfig.token,
          assetConfig.priceFeed,
        ]);
    });
    it("Success to add token (TSB token)", async () => {
      // before token number
      const beforeTokenNum = BigNumber.from(await diamondToken.getTokenNum());

      // create tsb token
      const tsbTokenData = tsbTokensJSON[0]; // tsbETH
      const underlyingTokenId = tsbTokenData.underlyingTokenId;
      const maturity = BigNumber.from(tsbTokenData.maturity);
      const name = tsbTokenData.name;
      const symbol = tsbTokenData.symbol;

      const createTsbTokenTx = await diamondTsb
        .connect(operator)
        .createTsbToken(underlyingTokenId, maturity, name, symbol);
      const createTsbTokenReceipt = await createTsbTokenTx.wait();
      const addr = createTsbTokenReceipt.events?.[0].args?.[0];

      // whitelist tsb token
      const tsbTokenAddr = await diamondTsb.getTsbToken(
        underlyingTokenId,
        maturity
      );
      const tsbToken = (await ethers.getContractAt(
        "TsbToken",
        tsbTokenAddr
      )) as TsbToken;

      const assetConfig = {
        isStableCoin: tsbTokenData.isStableCoin,
        isTsbToken: true,
        decimals: await tsbToken.decimals(),
        minDepositAmt: tsbTokenData.minDepositAmt,
        token: tsbTokenAddr,
        priceFeed: DEFAULT_ZERO_ADDR,
      };

      // add token
      const addTokenTx = await diamondToken
        .connect(operator)
        .addToken(assetConfig);
      await addTokenTx.wait();

      const tokenId = await diamondToken.getTokenId(assetConfig.token);

      // after token number
      const afterTokenNum = BigNumber.from(await diamondToken.getTokenNum());

      // check token number
      expect(afterTokenNum).to.be.equal(beforeTokenNum.add(1));
      expect(afterTokenNum).to.be.equal(tokenId);

      // check token config
      const tokenConfig = await diamondToken.getAssetConfig(tokenId);
      expect(tokenConfig.isStableCoin).to.be.equal(assetConfig.isStableCoin);
      expect(tokenConfig.isTsbToken).to.be.equal(assetConfig.isTsbToken);
      expect(tokenConfig.decimals).to.be.equal(assetConfig.decimals);
      expect(tokenConfig.minDepositAmt).to.be.equal(assetConfig.minDepositAmt);
      expect(tokenConfig.token).to.be.equal(assetConfig.token);
      expect(tokenConfig.priceFeed).to.be.equal(assetConfig.priceFeed);

      const [, maturityTime] = await tsbToken.tokenInfo();

      // check event
      await expect(addTokenTx)
        .to.emit(diamondToken, "TsbTokenWhitelisted")
        .withArgs(
          assetConfig.token,
          afterTokenNum,
          [
            assetConfig.isStableCoin,
            assetConfig.isTsbToken,
            assetConfig.decimals,
            assetConfig.minDepositAmt,
            assetConfig.token,
            assetConfig.priceFeed,
          ],
          maturityTime
        );
    });
    it("Fail to add token, sender is not admin", async () => {
      const assetConfig = {
        isStableCoin: false,
        isTsbToken: false,
        decimals: BigNumber.from(18),
        minDepositAmt: utils.parseEther("0.1"),
        token: Wallet.createRandom().address,
        priceFeed: Wallet.createRandom().address,
      };

      await expect(diamondToken.connect(user1).addToken(assetConfig)).to.be
        .reverted;
    });
    it("Fail to add token, token is already added", async () => {
      const assetConfig = {
        isStableCoin: false,
        isTsbToken: false,
        decimals: BigNumber.from(18),
        minDepositAmt: utils.parseEther("0.1"),
        token: DEFAULT_ETH_ADDRESS,
        priceFeed: Wallet.createRandom().address,
      };

      await expect(
        diamondToken.connect(operator).addToken(assetConfig)
      ).to.be.revertedWithCustomError(diamondToken, "TokenIsWhitelisted");
    });
  });
  describe("Set pause", () => {
    it("Success to set pause", async () => {
      const setPauseTx = await diamondToken
        .connect(admin)
        .setPaused(DEFAULT_ETH_ADDRESS, true);
      await setPauseTx.wait();

      const paused = await diamondToken.isTokenPaused(DEFAULT_ETH_ADDRESS);
      await expect(paused).to.be.true;
    });
    it("Fail to set pause, sender is not admin", async () => {
      await expect(
        diamondToken.connect(user1).setPaused(DEFAULT_ETH_ADDRESS, true)
      ).to.be.reverted;
    });
  });
  describe("Set priceFeed", () => {
    it("Success to set priceFeed", async () => {
      const newPriceFeed = Wallet.createRandom().address;
      const setPriceFeedTx = await diamondToken
        .connect(admin)
        .setPriceFeed(DEFAULT_ETH_ADDRESS, newPriceFeed);
      await setPriceFeedTx.wait();

      const tokenId = await diamondToken.getTokenId(DEFAULT_ETH_ADDRESS);

      const assetConfig = await diamondToken.getAssetConfig(tokenId);
      expect(assetConfig.priceFeed).to.be.equal(newPriceFeed);
    });
    it("Fail to set priceFeed, sender is not admin", async () => {
      const newPriceFeed = Wallet.createRandom().address;
      await expect(
        diamondToken
          .connect(user1)
          .setPriceFeed(DEFAULT_ETH_ADDRESS, newPriceFeed)
      ).to.be.reverted;
    });
  });
  describe("Set is stable coin", () => {
    it("Success to set is stable coin", async () => {
      const isStableCoin = true;
      const setStableCoinTx = await diamondToken
        .connect(admin)
        .setIsStableCoin(DEFAULT_ETH_ADDRESS, isStableCoin);
      await setStableCoinTx.wait();

      const tokenId = await diamondToken.getTokenId(DEFAULT_ETH_ADDRESS);

      const assetConfig = await diamondToken.getAssetConfig(tokenId);
      expect(assetConfig.isStableCoin).to.be.equal(isStableCoin);
    });
    it("Fail to set is stable coin, sender is not admin", async () => {
      const isStableCoin = true;
      await expect(
        diamondToken
          .connect(user1)
          .setIsStableCoin(DEFAULT_ETH_ADDRESS, isStableCoin)
      ).to.be.reverted;
    });
  });
  describe("Set minimum deposit amount", () => {
    it("Success to set minimum deposit amount", async () => {
      const newMinDepositAmt = utils.parseEther("0.1");
      const setMinDepositAmtTx = await diamondToken
        .connect(admin)
        .setMinDepositAmt(DEFAULT_ETH_ADDRESS, newMinDepositAmt);
      await setMinDepositAmtTx.wait();

      const tokenId = await diamondToken.getTokenId(DEFAULT_ETH_ADDRESS);

      const assetConfig = await diamondToken.getAssetConfig(tokenId);
      expect(assetConfig.minDepositAmt).to.be.equal(newMinDepositAmt);
    });
    it("Fail to set minimum deposit amount, sender is not admin", async () => {
      const newMinDepositAmt = utils.parseEther("0.1");
      await expect(
        diamondToken
          .connect(user1)
          .setMinDepositAmt(DEFAULT_ETH_ADDRESS, newMinDepositAmt)
      ).to.be.reverted;
    });
  });
});

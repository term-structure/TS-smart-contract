import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer, utils } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { MIN_DEPOSIT_AMOUNT, TS_BASE_TOKEN } from "term-structure-sdk";
import { FACET_NAMES } from "../../../utils/config";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { getRandomUint256 } from "../../utils/helper";
import {
  AccountFacet,
  ERC20Mock,
  TokenFacet,
  TsERC20,
  TsFaucet,
  ZkTrueUp,
} from "../../../typechain-types";

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES);
  return res;
};

describe("TsFaucet", () => {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondToken: TokenFacet;
  let tsFaucet: TsFaucet;
  let wethMock: ERC20Mock;
  let wbtcMock: ERC20Mock;
  let usdtMock: ERC20Mock;
  let usdcMock: ERC20Mock;
  let daiMock: ERC20Mock;

  before(async () => {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    operator = res.operator;
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;

    const TsFaucet = await ethers.getContractFactory("TsFaucet");
    const TsFaucetConstructorParams = ethers.utils.defaultAbiCoder.encode(
      ["address"],
      [zkTrueUp.address]
    );
    tsFaucet = await TsFaucet.connect(operator).deploy(
      TsFaucetConstructorParams
    );
    (await tsFaucet.deployed()) as TsFaucet;

    const wethMockAddr = await tsFaucet.tsERC20s(0);
    wethMock = (await ethers.getContractAt("TsERC20", wethMockAddr)) as TsERC20;
    const wbtcMockAddr = await tsFaucet.tsERC20s(1);
    wbtcMock = (await ethers.getContractAt("TsERC20", wbtcMockAddr)) as TsERC20;
    const usdtMockAddr = await tsFaucet.tsERC20s(2);
    usdtMock = (await ethers.getContractAt("TsERC20", usdtMockAddr)) as TsERC20;
    const usdcMockAddr = await tsFaucet.tsERC20s(3);
    usdcMock = (await ethers.getContractAt("TsERC20", usdcMockAddr)) as TsERC20;
    const daiMockAddr = await tsFaucet.tsERC20s(4);
    daiMock = (await ethers.getContractAt("TsERC20", daiMockAddr)) as TsERC20;
  });

  describe("Deploy tsFaucet", () => {
    it("Success to deploy", async () => {
      // constructor params
      expect(await tsFaucet.zkTrueUp()).to.equal(zkTrueUp.address);

      // success to deploy TsERC20
      expect(await wethMock.name()).to.equal("Wrapped Ether");
      expect(await wethMock.symbol()).to.equal("WETH");
      expect(await wethMock.decimals()).to.equal(18);

      expect(await wbtcMock.name()).to.equal("Wrapped Bitcoin");
      expect(await wbtcMock.symbol()).to.equal("WBTC");
      expect(await wbtcMock.decimals()).to.equal(8);

      expect(await usdtMock.name()).to.equal("Tether USD");
      expect(await usdtMock.symbol()).to.equal("USDT");
      expect(await usdtMock.decimals()).to.equal(6);

      expect(await usdcMock.name()).to.equal("USD Coin");
      expect(await usdcMock.symbol()).to.equal("USDC");
      expect(await usdcMock.decimals()).to.equal(6);

      expect(await daiMock.name()).to.equal("Dai Stablecoin");
      expect(await daiMock.symbol()).to.equal("DAI");
      expect(await daiMock.decimals()).to.equal(18);
    });
  });

  describe("Mint TsERC20", () => {
    it("Success to mint", async () => {
      // before total supply
      const beforeWethTotalSupply = await wethMock.totalSupply();
      const beforeWbtcTotalSupply = await wbtcMock.totalSupply();
      const beforeUsdtTotalSupply = await usdtMock.totalSupply();
      const beforeUsdcTotalSupply = await usdcMock.totalSupply();
      const beforeDaiTotalSupply = await daiMock.totalSupply();

      // mint
      const mintTx = await tsFaucet.connect(operator).batchMint(user1Addr);
      await mintTx.wait();

      // after total supply
      const afterWethTotalSupply = await wethMock.totalSupply();
      const afterWbtcTotalSupply = await wbtcMock.totalSupply();
      const afterUsdtTotalSupply = await usdtMock.totalSupply();
      const afterUsdcTotalSupply = await usdcMock.totalSupply();
      const afterDaiTotalSupply = await daiMock.totalSupply();

      // check event
      await expect(mintTx).to.emit(tsFaucet, "BatchMint").withArgs(user1Addr);

      // check isMinted
      expect(await tsFaucet.isMinted(user1Addr)).to.equal(true);

      // check balance
      expect(await wethMock.balanceOf(user1Addr)).to.equal(
        ethers.utils.parseUnits("1000", 18)
      );
      expect(await wbtcMock.balanceOf(user1Addr)).to.equal(
        ethers.utils.parseUnits("1000", 8)
      );
      expect(await usdtMock.balanceOf(user1Addr)).to.equal(
        ethers.utils.parseUnits("1000", 6)
      );
      expect(await usdcMock.balanceOf(user1Addr)).to.equal(
        ethers.utils.parseUnits("1000", 6)
      );
      expect(await daiMock.balanceOf(user1Addr)).to.equal(
        ethers.utils.parseUnits("1000", 18)
      );

      // check total supply
      expect(afterWethTotalSupply.sub(beforeWethTotalSupply)).to.equal(
        ethers.utils.parseUnits("1000", 18)
      );
      expect(afterWbtcTotalSupply.sub(beforeWbtcTotalSupply)).to.equal(
        ethers.utils.parseUnits("1000", 8)
      );
      expect(afterUsdtTotalSupply.sub(beforeUsdtTotalSupply)).to.equal(
        ethers.utils.parseUnits("1000", 6)
      );
      expect(afterUsdcTotalSupply.sub(beforeUsdcTotalSupply)).to.equal(
        ethers.utils.parseUnits("1000", 6)
      );
      expect(afterDaiTotalSupply.sub(beforeDaiTotalSupply)).to.equal(
        ethers.utils.parseUnits("1000", 18)
      );
    });

    it("Fail to mint, only mint once per address", async () => {
      await expect(
        tsFaucet.connect(operator).batchMint(user1Addr)
      ).to.be.revertedWith("Only mint once");
    });

    it("Fail to mint, only operator can mint", async () => {
      await expect(
        tsFaucet.connect(user1).batchMint(user1Addr)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Approve TsERC20", () => {
    it("Success to approve, approve to ZkTrueUp", async () => {
      const amount = ethers.constants.MaxUint256;
      await (
        await wbtcMock.connect(user1).approve(zkTrueUp.address, amount)
      ).wait();

      // check allowance
      expect(await wbtcMock.allowance(user1Addr, zkTrueUp.address)).to.equal(
        amount
      );
    });

    it("Fail to approve, cannot approve to addresses other than ZkTrueUp", async () => {
      const amount = ethers.constants.MaxUint256;
      await expect(
        wbtcMock.connect(user1).approve(user2Addr, amount)
      ).to.be.revertedWith("Invalid spender");
    });
  });

  describe("Transfer TsERC20", () => {
    it("Success to transfer, deposit to ZkTrueUp", async () => {
      const minDepositAmt = utils.parseUnits(
        MIN_DEPOSIT_AMOUNT.USDT.toString(),
        TS_BASE_TOKEN.USDT.decimals
      );
      const usdtAssetConfig = {
        isStableCoin: true,
        isTsbToken: false,
        decimals: await usdtMock.decimals(),
        minDepositAmt: minDepositAmt,
        tokenAddr: usdtMock.address,
        priceFeed: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
      };

      await diamondToken.connect(operator).addToken(usdtAssetConfig);

      // before balance
      const beforeUsdtBalance = await usdtMock.balanceOf(user1Addr);
      const beforeZkTrueUpBalance = await usdtMock.balanceOf(zkTrueUp.address);

      // register
      const amount = ethers.constants.MaxUint256;
      await (
        await usdtMock.connect(user1).approve(zkTrueUp.address, amount)
      ).wait();
      const regAmount = utils.parseUnits("10", TS_BASE_TOKEN.USDT.decimals);
      const pubKey = { X: getRandomUint256(), Y: getRandomUint256() };
      const registerTx = await diamondAcc
        .connect(user1)
        .register(pubKey.X, pubKey.Y, usdtMock.address, regAmount);
      await registerTx.wait();

      // after balance
      const afterUsdtBalance = await usdtMock.balanceOf(user1Addr);
      const afterZkTrueUpBalance = await usdtMock.balanceOf(zkTrueUp.address);

      // check balance
      expect(beforeUsdtBalance.sub(afterUsdtBalance)).to.equal(
        ethers.utils.parseUnits("10", await usdtMock.decimals())
      );
      expect(afterZkTrueUpBalance.sub(beforeZkTrueUpBalance)).to.equal(
        ethers.utils.parseUnits("10", await usdtMock.decimals())
      );
    });
    it("Fail to transfer, cannot transfer to addresses other than ZkTrueUp and TsbFactory", async () => {
      await expect(
        usdtMock
          .connect(user1)
          .transfer(
            user2Addr,
            ethers.utils.parseUnits("10", await usdtMock.decimals())
          )
      ).to.be.revertedWith("Invalid recipient");
    });
  });
});

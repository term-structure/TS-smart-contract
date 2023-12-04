import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
  WstETHPriceFeed,
  WstETHPriceFeed__factory,
} from "../../../typechain-types";
import { MAINNET_ADDRESS } from "../../../utils/config";

describe("Customized WstETH oracle contract", () => {
  let wstETHPriceFeedFactory: WstETHPriceFeed__factory;
  let wstETHPriceFeed: WstETHPriceFeed;

  beforeEach(async () => {
    wstETHPriceFeedFactory = (await ethers.getContractFactory(
      "WstETHPriceFeed"
    )) as WstETHPriceFeed__factory;
    const wstETHAddr = MAINNET_ADDRESS.WSTETH;
    const stETHPriceFeed = MAINNET_ADDRESS.STETH_PRICE_FEED;
    wstETHPriceFeed = await wstETHPriceFeedFactory.deploy(
      wstETHAddr,
      stETHPriceFeed
    );
    await wstETHPriceFeed.deployed();
  });

  it("Success to get data from wstETH oracle", async () => {
    const wstETH = await ethers.getContractAt(
      "IWstETH",
      MAINNET_ADDRESS.WSTETH
    );
    const stETHPriceFeed = await ethers.getContractAt(
      "AggregatorV3Interface",
      MAINNET_ADDRESS.STETH_PRICE_FEED
    );
    const stETHPriceDecimals = await stETHPriceFeed.decimals();
    const stETHDescription = await stETHPriceFeed.description();
    const stETHVersion = await stETHPriceFeed.version();
    const stETHLatestRoundData = await stETHPriceFeed.latestRoundData();

    const wstETHPriceDecimals = await wstETHPriceFeed.decimals();
    const wstETHDescription = await wstETHPriceFeed.description();
    const wstETHVersion = await wstETHPriceFeed.version();
    const wstETHLatestRoundData = await wstETHPriceFeed.latestRoundData();

    await expect(wstETHPriceFeed.getRoundData(0)).to.be.revertedWithCustomError(
      wstETHPriceFeed,
      "GetRoundDataNotSupported"
    );

    expect(stETHPriceDecimals).to.equal(wstETHPriceDecimals);
    expect(stETHDescription).to.equal(wstETHDescription);
    expect(stETHVersion).to.equal(wstETHVersion);
    expect(stETHLatestRoundData.roundId).to.equal(
      wstETHLatestRoundData.roundId
    );

    expect(stETHLatestRoundData.startedAt).to.equal(
      wstETHLatestRoundData.startedAt
    );
    expect(stETHLatestRoundData.updatedAt).to.equal(
      wstETHLatestRoundData.updatedAt
    );
    expect(stETHLatestRoundData.answeredInRound).to.equal(
      wstETHLatestRoundData.answeredInRound
    );

    const stEthPerWstEth = await wstETH.stEthPerToken();
    const calcWstETHPrice = BigNumber.from(stETHLatestRoundData.answer)
      .mul(stEthPerWstEth)
      .div(BigNumber.from(10).pow(18));
    expect(calcWstETHPrice).to.equal(wstETHLatestRoundData.answer);
  });
});

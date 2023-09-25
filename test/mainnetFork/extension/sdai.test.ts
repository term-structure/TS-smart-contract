import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
  SDaiPriceFeed,
  SDaiPriceFeed__factory,
} from "../../../typechain-types";
import { MAINNET_ADDRESS } from "../../../utils/config";

describe("Customized sDai oracle contract", () => {
  let sDaiPriceFeedFactory: SDaiPriceFeed__factory;
  let sDaiPriceFeed: SDaiPriceFeed;

  beforeEach(async () => {
    sDaiPriceFeedFactory = (await ethers.getContractFactory(
      "SDaiPriceFeed"
    )) as SDaiPriceFeed__factory;
    const potAddr = MAINNET_ADDRESS.MAKER_POT;
    const daiPriceFeed = MAINNET_ADDRESS.DAI_PRICE_FEED;
    sDaiPriceFeed = await sDaiPriceFeedFactory.deploy(potAddr, daiPriceFeed);
    await sDaiPriceFeed.deployed();
  });

  it("Success to get data from sDai oracle", async () => {
    const pot = await ethers.getContractAt("IPot", MAINNET_ADDRESS.MAKER_POT);
    const daiPriceFeed = await ethers.getContractAt(
      "AggregatorV3Interface",
      MAINNET_ADDRESS.DAI_PRICE_FEED
    );
    const daiPriceDecimals = await daiPriceFeed.decimals();
    const daiDescription = await daiPriceFeed.description();
    const daiVersion = await daiPriceFeed.version();
    const daiLatestRoundData = await daiPriceFeed.latestRoundData();

    const sDaiPriceDecimals = await sDaiPriceFeed.decimals();
    const sDaiDescription = await sDaiPriceFeed.description();
    const sDaiVersion = await sDaiPriceFeed.version();
    const sDaiLatestRoundData = await sDaiPriceFeed.latestRoundData();

    await expect(sDaiPriceFeed.getRoundData(0)).to.be.revertedWithCustomError(
      sDaiPriceFeed,
      "GetRoundDataNotSupported"
    );

    expect(daiPriceDecimals).to.equal(sDaiPriceDecimals);
    expect(daiDescription).to.equal(sDaiDescription);
    expect(daiVersion).to.equal(sDaiVersion);
    expect(daiLatestRoundData.roundId).to.equal(sDaiLatestRoundData.roundId);

    expect(daiLatestRoundData.startedAt).to.equal(
      sDaiLatestRoundData.startedAt
    );
    expect(daiLatestRoundData.updatedAt).to.equal(
      sDaiLatestRoundData.updatedAt
    );
    expect(daiLatestRoundData.answeredInRound).to.equal(
      sDaiLatestRoundData.answeredInRound
    );

    const chi = await pot.chi();
    const calcSDaiPrice = BigNumber.from(daiLatestRoundData.answer)
      .mul(chi)
      .div(BigNumber.from(10).pow(27));
    expect(calcSDaiPrice).to.equal(sDaiLatestRoundData.answer);
  });
});

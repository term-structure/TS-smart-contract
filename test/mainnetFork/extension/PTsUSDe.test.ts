import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
  AggregatorV3Interface,
  PendlePYLpOracle,
  PTWithRedStonePriceFeed,
  PTWithRedStonePriceFeed__factory,
} from "../../../typechain-types";

const PendlePYLpOracleAddr = "0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2";
const marketAddr = "0xd1d7d99764f8a52aff007b7831cc02748b2013b5";
const duration = 900;
const redstonePriceFeedAddr = "0xb99D174ED06c83588Af997c8859F93E83dD4733f";

describe("Customized PT oracle contract", () => {
  let pendlePYLpOracle: PendlePYLpOracle;
  let redstonePriceFeed: AggregatorV3Interface;
  let PTWithRedStonePriceFeed: PTWithRedStonePriceFeed;

  beforeEach(async () => {
    const PTWithRedStonePriceFeedFactory = (await ethers.getContractFactory(
      "PTWithRedStonePriceFeed"
    )) as PTWithRedStonePriceFeed__factory;
    PTWithRedStonePriceFeed = await PTWithRedStonePriceFeedFactory.deploy(
      PendlePYLpOracleAddr,
      marketAddr,
      duration,
      redstonePriceFeedAddr,
      { gasLimit: 10000000 }
    );
    await PTWithRedStonePriceFeed.deployed();

    redstonePriceFeed = await ethers.getContractAt(
      "AggregatorV3Interface",
      redstonePriceFeedAddr
    );

    pendlePYLpOracle = (await ethers.getContractAt(
      "PendlePYLpOracle",
      PendlePYLpOracleAddr
    )) as PendlePYLpOracle;
  });

  it("Success to get PTsUSDe price", async () => {
    const sUSDePriceDecimals = await redstonePriceFeed.decimals();
    const sUSDeDescription = await redstonePriceFeed.description();
    const sUSDeVersion = await redstonePriceFeed.version();
    const sUSDeLatestRoundData = await redstonePriceFeed.latestRoundData();
    const PTsUSDePriceDecimals = await PTWithRedStonePriceFeed.decimals();
    const PTsUSDeDescription = await PTWithRedStonePriceFeed.description();
    const PTsUSDeVersion = await PTWithRedStonePriceFeed.version();
    const PTsUSDeLatestRoundData =
      await PTWithRedStonePriceFeed.latestRoundData();
    await expect(
      PTWithRedStonePriceFeed.getRoundData(0)
    ).to.be.revertedWithCustomError(
      PTWithRedStonePriceFeed,
      "GetRoundDataNotSupported"
    );
    expect(sUSDePriceDecimals).to.equal(PTsUSDePriceDecimals);
    expect(sUSDeDescription).to.equal(PTsUSDeDescription);
    expect(sUSDeVersion).to.equal(PTsUSDeVersion);
    expect(sUSDeLatestRoundData.roundId).to.equal(
      PTsUSDeLatestRoundData.roundId
    );
    expect(sUSDeLatestRoundData.startedAt).to.equal(
      PTsUSDeLatestRoundData.startedAt
    );
    expect(sUSDeLatestRoundData.updatedAt).to.equal(
      PTsUSDeLatestRoundData.updatedAt
    );
    expect(sUSDeLatestRoundData.answeredInRound).to.equal(
      PTsUSDeLatestRoundData.answeredInRound
    );
    const ptRateInsUSDe = await pendlePYLpOracle.getPtToSyRate(
      marketAddr,
      duration
    );
    const calcPTsUSDePrice = BigNumber.from(sUSDeLatestRoundData.answer)
      .mul(ptRateInsUSDe)
      .div(BigNumber.from(10).pow(18));
    expect(calcPTsUSDePrice).to.equal(PTsUSDeLatestRoundData.answer);
  });
});

// import { expect } from "chai";
// import { ethers } from "hardhat";
// import { BigNumber } from "ethers";
// import {
//   PTsUSDeWithRedStonePriceFeed,
//   PTsUSDeWithRedStonePriceFeed__factory,
// } from "../../../typechain-types";

// const PendlePYLpOracleAddr = "0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2";
// const marketAddr = "0xd1d7d99764f8a52aff007b7831cc02748b2013b5";
// const duration = 900;
// const redstonePriceFeedAddr = "0xb99D174ED06c83588Af997c8859F93E83dD4733f";

// describe("Customized PTsUSDe oracle contract", () => {
//   let PTsUSDeWithRedStonePriceFeedFactory: PTsUSDeWithRedStonePriceFeed__factory;
//   let PTsUSDeWithRedStonePriceFeed: PTsUSDeWithRedStonePriceFeed;

//   beforeEach(async () => {
//     PTsUSDeWithRedStonePriceFeedFactory = (await ethers.getContractFactory(
//       "PTsUSDeWithRedStonePriceFeed__factory"
//     )) as PTsUSDeWithRedStonePriceFeed__factory;
//     PTsUSDeWithRedStonePriceFeed =
//       await PTsUSDeWithRedStonePriceFeedFactory.deploy(
//         PendlePYLpOracleAddr,
//         marketAddr,
//         duration,
//         redstonePriceFeedAddr
//       );
//     await PTsUSDeWithRedStonePriceFeed.deployed();
//   });

//   it("Success to get data from wstETH oracle", async () => {
//     const wstETH = await ethers.getContractAt(
//       "IWstETH",
//       MAINNET_ADDRESS.WSTETH
//     );
//     const stETHPriceFeed = await ethers.getContractAt(
//       "AggregatorV3Interface",
//       MAINNET_ADDRESS.STETH_PRICE_FEED
//     );
//     const stETHPriceDecimals = await stETHPriceFeed.decimals();
//     const stETHDescription = await stETHPriceFeed.description();
//     const stETHVersion = await stETHPriceFeed.version();
//     const stETHLatestRoundData = await stETHPriceFeed.latestRoundData();

//     const wstETHPriceDecimals = await wstETHPriceFeed.decimals();
//     const wstETHDescription = await wstETHPriceFeed.description();
//     const wstETHVersion = await wstETHPriceFeed.version();
//     const wstETHLatestRoundData = await wstETHPriceFeed.latestRoundData();

//     await expect(wstETHPriceFeed.getRoundData(0)).to.be.revertedWithCustomError(
//       wstETHPriceFeed,
//       "GetRoundDataNotSupported"
//     );

//     expect(stETHPriceDecimals).to.equal(wstETHPriceDecimals);
//     expect(stETHDescription).to.equal(wstETHDescription);
//     expect(stETHVersion).to.equal(wstETHVersion);
//     expect(stETHLatestRoundData.roundId).to.equal(
//       wstETHLatestRoundData.roundId
//     );

//     expect(stETHLatestRoundData.startedAt).to.equal(
//       wstETHLatestRoundData.startedAt
//     );
//     expect(stETHLatestRoundData.updatedAt).to.equal(
//       wstETHLatestRoundData.updatedAt
//     );
//     expect(stETHLatestRoundData.answeredInRound).to.equal(
//       wstETHLatestRoundData.answeredInRound
//     );

//     const stEthPerWstEth = await wstETH.stEthPerToken();
//     const calcWstETHPrice = BigNumber.from(stETHLatestRoundData.answer)
//       .mul(stEthPerWstEth)
//       .div(BigNumber.from(10).pow(18));
//     expect(calcWstETHPrice).to.equal(wstETHLatestRoundData.answer);
//   });
// });

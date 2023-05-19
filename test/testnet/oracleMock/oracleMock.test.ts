import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { OracleMock, TokenFacet } from "../../../typechain-types";
import { FACET_NAMES } from "../../../utils/config";
import { useFacet } from "../../../utils/useFacet";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { BigNumber, Signer } from "ethers";
import { BaseTokenAddresses, PriceFeeds } from "../../../utils/type";
import { TsTokenId } from "term-structure-sdk";
import { ethers } from "hardhat";

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES);
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

describe("Oracle Mock", () => {
  let operator: Signer;
  let baseTokenAddresses: BaseTokenAddresses;
  let priceFeeds: PriceFeeds;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    operator = res.operator;
    baseTokenAddresses = res.baseTokenAddresses;
    priceFeeds = res.priceFeeds;
    // update test price feed
    const ethOracle = (await ethers.getContractAt(
      "OracleMock",
      priceFeeds[TsTokenId.ETH]
    )) as OracleMock;
    const roundData = {
      roundId: 1,
      answer: "120000000000",
      startedAt: 0,
      updatedAt: 0,
      answeredInRound: 0,
    };
    await ethOracle.connect(operator).updateRoundData(roundData);
  });
  it("Success to get price feed", async () => {
    // get oracle price
    const ethOracle = (await ethers.getContractAt(
      "OracleMock",
      priceFeeds[TsTokenId.ETH]
    )) as OracleMock;
    const answer = await (await ethOracle.latestRoundData()).answer;
    expect(answer).to.equal(BigNumber.from(120000000000));
  });
  it("Success to update price feed", async () => {
    // test update price feed and get price again
    const ethOracle = (await ethers.getContractAt(
      "OracleMock",
      priceFeeds[TsTokenId.ETH]
    )) as OracleMock;
    const newRoundData = {
      roundId: 2,
      answer: "125000000000",
      startedAt: 0,
      updatedAt: 0,
      answeredInRound: 0,
    };
    await ethOracle.connect(operator).updateRoundData(newRoundData);
    const answer = await (await ethOracle.latestRoundData()).answer;
    expect(answer).to.equal(BigNumber.from(125000000000));
  });
});

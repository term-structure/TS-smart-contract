import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, utils } from "ethers";
import { BaseTokenAddresses } from "../../../utils/type";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import { MIN_DEPOSIT_AMOUNT, TsTokenId } from "term-structure-sdk";
import { register } from "../../utils/register";
import {
  AccountFacet,
  RollupFacet,
  TokenFacet,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";

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

describe("Activating evacuation", function () {
  let [user1]: Signer[] = [];
  let [user1Addr]: string[] = [];
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondRollup: RollupFacet;
  let baseTokenAddresses: BaseTokenAddresses;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1] = await ethers.getSigners();
    [user1Addr] = await Promise.all([user1.getAddress()]);
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUp)) as AccountFacet;
    diamondRollup = (await useFacet("RollupFacet", zkTrueUp)) as RollupFacet;
    baseTokenAddresses = res.baseTokenAddresses;
  });

  it("Success to activateEvacuation", async function () {
    // register acc1
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await register(
      user1,
      Number(TsTokenId.ETH),
      amount,
      baseTokenAddresses,
      diamondAcc
    );
    // expirationBlock = 14 days / 15 seconds (for one block) = 80640
    await mine(80639);
    expect(await diamondRollup.isEvacuMode()).to.equal(false);
    await diamondRollup.activateEvacuation();
    expect(await diamondRollup.isEvacuMode()).to.equal(true);
  });

  it("Failed to activate evacuation, since there is no L1 request expired", async function () {
    // register acc1
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await register(
      user1,
      Number(TsTokenId.ETH),
      amount,
      baseTokenAddresses,
      diamondAcc
    );

    // expirationBlock = 14 days / 15 seconds (for one block) = 80640
    await mine(80600);
    expect(await diamondRollup.isEvacuMode()).to.equal(false);
    await diamondRollup.activateEvacuation();
    expect(await diamondRollup.isEvacuMode()).to.equal(false);
  });

  it("Failed to activate evacuation, because the system is in evacuation mode", async function () {
    // register acc1
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await register(
      user1,
      Number(TsTokenId.ETH),
      amount,
      baseTokenAddresses,
      diamondAcc
    );

    // expirationBlock = 14 days / 15 seconds (for one block) = 80640
    await mine(80639);
    expect(await diamondRollup.isEvacuMode()).to.equal(false);
    await diamondRollup.activateEvacuation();
    expect(await diamondRollup.isEvacuMode()).to.equal(true);
    expect(diamondRollup.activateEvacuation()).to.be.revertedWithCustomError(
      diamondRollup,
      "EvacuModeActivated"
    );
  });
});

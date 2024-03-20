import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { BaseTokenAddresses } from "../../../utils/type";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import { EMPTY_HASH } from "term-structure-sdk";
import {
  AccountFacet,
  EvacuationFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  ZkTrueUp,
} from "../../../typechain-types";
import { StoredBlockStruct } from "../../../typechain-types/contracts/zkTrueUp/rollup/IRollupFacet";
import {
  Users,
  commitOneBlock,
  handler,
  preprocessAndRollupBlocks,
  verifyOneBlock,
} from "../../utils/rollBorrowRollupHelper";
import { rollupData } from "../../data/rollup/test_data";

const initStateRoot = utils.hexZeroPad(
  utils.hexlify(BigInt(rollupData.initState.stateRoot)),
  32
);

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES, false, undefined, initStateRoot);
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

describe("Activating evacuation", function () {
  let accounts: Users;
  let storedBlocks: StoredBlockStruct[] = [];
  let zkTrueUp: ZkTrueUp;
  let operator: Signer;
  let diamondAcc: AccountFacet;
  let diamondRollup: RollupFacet;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let diamondLoan: LoanFacet;
  let diamondEvacuation: EvacuationFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  const genesisBlock: StoredBlockStruct = {
    blockNumber: BigNumber.from("0"),
    stateRoot: initStateRoot,
    l1RequestNum: BigNumber.from("0"),
    pendingRollupTxHash: EMPTY_HASH,
    commitment: utils.defaultAbiCoder.encode(
      ["bytes32"],
      [String("0x").padEnd(66, "0")]
    ),
    timestamp: BigNumber.from("0"),
  };

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    zkTrueUp = res.zkTrueUp;
    operator = res.operator;
    const zkTrueUpAddr = zkTrueUp.address;
    accounts = new Users(await ethers.getSigners());
    rollupData.user_data.forEach((user) =>
      accounts.addUser(user.tsPubKeyX, user.tsPubKeyY)
    );
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUpAddr)) as LoanFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondEvacuation = (await useFacet(
      "EvacuationFacet",
      zkTrueUpAddr
    )) as EvacuationFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    storedBlocks.push(genesisBlock);
    const COMMITTED_BLOCK_NUM = 5;
    const EXECUTED_BLOCK_NUM = 3;

    // preprocess tx and rollup the first 3 blocks
    const latestStoredBlock = await preprocessAndRollupBlocks(
      EXECUTED_BLOCK_NUM,
      rollupData,
      diamondAcc,
      diamondRollup,
      diamondTsb,
      diamondToken,
      diamondLoan,
      operator,
      accounts,
      baseTokenAddresses,
      genesisBlock
    );

    // commit and verify the 4th and 5th blocks but not execute
    let newStoredBlock = latestStoredBlock;
    for (let j = EXECUTED_BLOCK_NUM; j < COMMITTED_BLOCK_NUM; j++) {
      const block = rollupData.blocks[j];
      for (let i = 0; i < block.l1RequestPubData.length; ) {
        // do l1 behavior before rollup
        const numOfL1RequestToBeProcessed = await handler(
          diamondTsb,
          diamondToken,
          diamondLoan,
          diamondAcc,
          operator,
          block.l1RequestPubData[i],
          block.l1RequestPubData[i + 1],
          accounts,
          baseTokenAddresses
        );
        i += numOfL1RequestToBeProcessed;
      }

      await commitOneBlock(
        diamondRollup,
        operator,
        block as any,
        newStoredBlock
      );

      newStoredBlock = block.storedBlock;

      await verifyOneBlock(diamondRollup, operator, block as any);
    }
  });

  it("Success to activateEvacuation", async function () {
    const [oldCommittedBlockNum, oldVerifiedBlockNum, oldExecutedBlockNum] =
      await diamondRollup.getBlockNum();
    const [
      oldCommittedL1RequestNum,
      oldExecutedL1RequestNum,
      oldTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    expect(await diamondEvacuation.isEvacuMode()).to.equal(false);
    await diamondEvacuation.activateEvacuation();

    const [newCommittedBlockNum, newVerifiedBlockNum, newExecutedBlockNum] =
      await diamondRollup.getBlockNum();

    const [
      newCommittedL1RequestNum,
      newExecutedL1RequestNum,
      newTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // check the contract is in evacuation mode
    expect(await diamondEvacuation.isEvacuMode()).to.equal(true);
    // check the committed block num and verified block num are rollbacked to executed block num
    expect(oldCommittedBlockNum - newCommittedBlockNum).to.equal(2);
    expect(oldVerifiedBlockNum - newVerifiedBlockNum).to.equal(2);
    expect(newCommittedBlockNum).to.equal(oldExecutedBlockNum);
    expect(newVerifiedBlockNum).to.equal(oldExecutedBlockNum);
    expect(newExecutedBlockNum).to.equal(oldExecutedBlockNum);
    // check the committed L1 request num is rollbacked to executed L1 request num
    expect(oldCommittedL1RequestNum.sub(newCommittedL1RequestNum)).to.equal(4);
    expect(newCommittedL1RequestNum).to.equal(oldExecutedL1RequestNum);
    expect(newExecutedL1RequestNum).to.equal(oldExecutedL1RequestNum);
    expect(newTotalL1RequestNum).to.equal(oldTotalL1RequestNum);
  });

  it("Failed to activate evacuation, since there is no L1 request expired", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(13));
    expect(await diamondEvacuation.isEvacuMode()).to.equal(false);
    await expect(
      diamondEvacuation.activateEvacuation()
    ).to.be.revertedWithCustomError(diamondEvacuation, "TimeStampIsNotExpired");
  });

  it("Failed to activate evacuation, because the system is in evacuation mode", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    expect(await diamondEvacuation.isEvacuMode()).to.equal(false);
    await diamondEvacuation.activateEvacuation();
    expect(await diamondEvacuation.isEvacuMode()).to.equal(true);
    expect(
      diamondEvacuation.activateEvacuation()
    ).to.be.revertedWithCustomError(diamondEvacuation, "EvacuModeActivated");
  });
});

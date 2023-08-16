import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { resolve } from "path";
import { BaseTokenAddresses } from "../../../utils/type";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import {
  EMPTY_HASH,
  MIN_DEPOSIT_AMOUNT,
  TsTokenId,
  TsTxType,
} from "term-structure-sdk";
import { register } from "../../utils/register";
import {
  AccountFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  actionDispatcher,
  doCreateBondToken,
  doDeposit,
  doForceWithdraw,
  doRegister,
  getCommitBlock,
  getExecuteBlock,
  getPendingRollupTxPubData,
  getStoredBlock,
  initTestData,
} from "../../utils/rollupHelper";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  ProofStruct,
  StoredBlockStruct,
  VerifyBlockStruct,
} from "../../../typechain-types/contracts/zkTrueUp/rollup/IRollupFacet";
import initStates from "../../data/rollupData/local-block-230808/initStates.json";
const testDataPath = resolve("./test/data/rollupData/local-block-230808");
const testData = initTestData(testDataPath);

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

describe("Activating evacuation", function () {
  let [user1]: Signer[] = [];
  let accounts: Signer[];
  let storedBlocks: StoredBlockStruct[] = [];
  let zkTrueUp: ZkTrueUp;
  let operator: Signer;
  let diamondAcc: AccountFacet;
  let diamondRollup: RollupFacet;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  const genesisBlock: StoredBlockStruct = {
    blockNumber: BigNumber.from("0"),
    stateRoot: initStates.stateRoot,
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
    [user1] = await ethers.getSigners();
    accounts = await ethers.getSigners();
    zkTrueUp = res.zkTrueUp;
    operator = res.operator;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    storedBlocks.push(genesisBlock);
    let committedBlockNum: number = 0;
    let provedBlockNum: number = 0;
    let executedBlockNum: number = 0;
    const COMMITTED_BLOCK_NUM = 5;
    const EXECUTED_BLOCK_NUM = 3;

    // commit and verify 5 blocks and execute 3 blocks
    for (let i = 0; i < COMMITTED_BLOCK_NUM; i++) {
      const testCase = testData[i];
      committedBlockNum += 1;
      provedBlockNum += 1;
      executedBlockNum += 1;

      // do some L1 requests from test case
      for (let i = 0; i < testCase.reqDataList.length; i++) {
        const reqType = testCase.reqDataList[i][0];
        await actionDispatcher(
          reqType,
          operator,
          accounts,
          baseTokenAddresses,
          testCase,
          i,
          diamondAcc,
          diamondToken,
          diamondTsb
        );
      }

      // commit blocks
      const lastCommittedBlock = storedBlocks[committedBlockNum - 1];
      const newBlocks: CommitBlockStruct[] = [];
      const commitBlock = getCommitBlock(lastCommittedBlock, testCase);
      newBlocks.push(commitBlock);
      await diamondRollup
        .connect(operator)
        .commitBlocks(lastCommittedBlock, newBlocks);
      const storedBlock = getStoredBlock(commitBlock, testCase);
      storedBlocks.push(storedBlock);

      // verify block
      const committedBlocks: StoredBlockStruct[] = [];
      const committedBlock = storedBlocks[provedBlockNum];
      committedBlocks.push(committedBlock);
      const proofs: ProofStruct[] = [];
      const proof: ProofStruct = testCase.callData;
      proofs.push(proof);
      const verifyingBlocks: VerifyBlockStruct[] = [];
      verifyingBlocks.push({
        storedBlock: committedBlock,
        proof: proof,
      });
      await diamondRollup.connect(operator).verifyBlocks(verifyingBlocks);

      if (i < EXECUTED_BLOCK_NUM) {
        // execute block
        const pendingBlocks: ExecuteBlockStruct[] = [];
        const pendingRollupTxPubData = getPendingRollupTxPubData(testCase);
        const executeBlock = getExecuteBlock(
          storedBlocks[executedBlockNum],
          pendingRollupTxPubData
        );
        pendingBlocks.push(executeBlock);
        await diamondRollup.connect(operator).executeBlocks(pendingBlocks);
      }
    }
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
    const [oldCommittedBlockNum, oldVerifiedBlockNum, oldExecutedBlockNum] =
      await diamondRollup.getBlockNum();
    const [
      oldCommittedL1RequestNum,
      oldExecutedL1RequestNum,
      oldTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    expect(await diamondRollup.isEvacuMode()).to.equal(false);
    await diamondRollup.activateEvacuation();

    const [newCommittedBlockNum, newVerifiedBlockNum, newExecutedBlockNum] =
      await diamondRollup.getBlockNum();

    const [
      newCommittedL1RequestNum,
      newExecutedL1RequestNum,
      newTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // check the contract is in evacuation mode
    expect(await diamondRollup.isEvacuMode()).to.equal(true);
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
    // register acc1
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await register(
      user1,
      Number(TsTokenId.ETH),
      amount,
      baseTokenAddresses,
      diamondAcc
    );

    // expiration period = 14 days
    await time.increase(time.duration.days(13));
    expect(await diamondRollup.isEvacuMode()).to.equal(false);
    await expect(
      diamondRollup.activateEvacuation()
    ).to.be.revertedWithCustomError(diamondRollup, "TimeStampIsNotExpired");
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

    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    expect(await diamondRollup.isEvacuMode()).to.equal(false);
    await diamondRollup.activateEvacuation();
    expect(await diamondRollup.isEvacuMode()).to.equal(true);
    expect(diamondRollup.activateEvacuation()).to.be.revertedWithCustomError(
      diamondRollup,
      "EvacuModeActivated"
    );
  });
});

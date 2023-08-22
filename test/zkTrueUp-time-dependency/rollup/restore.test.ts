import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, utils, Signer } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { resolve } from "path";
import { useFacet } from "../../../utils/useFacet";
import { deployAndInit } from "../../utils/deployAndInit";
import { FACET_NAMES } from "../../../utils/config";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { BaseTokenAddresses } from "../../../utils/type";
import {
  DEFAULT_ETH_ADDRESS,
  EMPTY_HASH,
  MIN_DEPOSIT_AMOUNT,
  TS_BASE_TOKEN,
  TsTokenId,
  TsTxType,
} from "term-structure-sdk";
import {
  AccountFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  actionDispatcher,
  getExecuteBlock,
  getPendingRollupTxPubData,
  initTestData,
} from "../../utils/rollupHelper";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  ProofStruct,
  StoredBlockStruct,
  VerifyBlockStruct,
} from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";
import { toL2Amt } from "../../utils/amountConvertor";
import initStates from "../../data/rollupData/rollup/initStates.json";
const testDataPath = resolve("./test/data/rollupData/rollup");
const testData = initTestData(testDataPath);
const restoreDataPath = resolve("./test/data/rollupData/restoreData");
const restoreData = initTestData(restoreDataPath);
import _case01 from "../../data/rollupData/evacuate/case01.json";
import _case02 from "../../data/rollupData/evacuate/case02.json";
import _case03 from "../../data/rollupData/evacuate/case03.json";
import _case04 from "../../data/rollupData/evacuate/case04.json";

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

describe("Restore protocol", function () {
  let storedBlocks: StoredBlockStruct[] = [];
  const genesisBlock: StoredBlockStruct = {
    blockNumber: BigNumber.from("0"),
    stateRoot: initStates.stateRoot,
    l1RequestNum: BigNumber.from("0"),
    pendingRollupTxHash: EMPTY_HASH,
    commitment: ethers.utils.defaultAbiCoder.encode(
      ["bytes32"],
      [String("0x").padEnd(66, "0")]
    ),
    timestamp: BigNumber.from("0"),
  };
  let accounts: Signer[];
  let committedBlockNum = 0;
  let provedBlockNum = 0;
  let executedBlockNum = 0;
  let operator: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondRollup: RollupFacet;
  let diamondTsb: TsbFacet;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let case01: typeof _case01;
  let case02: typeof _case02;
  let case03: typeof _case03;
  let case04: typeof _case04;

  // simulate the situation before restore protocol
  // 1. over 14 days since the last block executed
  // 2. evacuation mode is activated
  // 3. consume all L1 requests
  // 4. user evacuate
  beforeEach(async function () {
    const res = await loadFixture(fixture);
    case01 = JSON.parse(JSON.stringify(_case01));
    case02 = JSON.parse(JSON.stringify(_case02));
    case03 = JSON.parse(JSON.stringify(_case03));
    case04 = JSON.parse(JSON.stringify(_case04));
    storedBlocks = [];
    storedBlocks.push(genesisBlock);
    committedBlockNum = 1;
    provedBlockNum = 1;
    executedBlockNum = 1;
    operator = res.operator;
    weth = res.weth;
    accounts = await ethers.getSigners();
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    const EXECUTE_BLOCK_NUMBER = 21;

    for (let k = 0; k < EXECUTE_BLOCK_NUMBER; k++) {
      const testCase = testData[k];
      // before rollup
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
      // get last committed block
      const lastCommittedBlock = storedBlocks[committedBlockNum - 1];
      // generate new blocks
      const newBlocks: CommitBlockStruct[] = [];
      const blockNumber = BigNumber.from(lastCommittedBlock.blockNumber).add(1);
      const commitBlock: CommitBlockStruct = {
        blockNumber,
        newStateRoot: testCase.commitBlock.newFlowInfo.stateRoot,
        newTsRoot: testCase.commitBlock.newFlowInfo.tsRoot,
        publicData: testCase.commitBlock.o_chunk,
        chunkIdDeltas: testCase.commitBlock.chunkIdDeltas,
        timestamp: testCase.commitBlock.timestamp,
      };
      newBlocks.push(commitBlock);

      // mock timestamp to test case timestamp
      await time.increaseTo(Number(commitBlock.timestamp));

      // commit blocks
      await diamondRollup
        .connect(operator)
        .commitBlocks(lastCommittedBlock, newBlocks);
      const storedBlock: StoredBlockStruct = {
        blockNumber,
        l1RequestNum: testCase.commitBlock.l1RequestNum,
        pendingRollupTxHash: testCase.commitBlock.pendingRollupTxHash,
        commitment: testCase.commitBlock.commitment,
        stateRoot: testCase.commitBlock.newFlowInfo.stateRoot,
        timestamp: testCase.commitBlock.timestamp,
      };
      storedBlocks.push(storedBlock);
      // update state
      committedBlockNum += newBlocks.length;

      // verify blocks
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
      provedBlockNum += committedBlocks.length;

      // execute blocks
      const pendingBlocks: ExecuteBlockStruct[] = [];
      const pendingRollupTxPubData = getPendingRollupTxPubData(testCase);
      const executeBlock = getExecuteBlock(
        storedBlocks[executedBlockNum],
        pendingRollupTxPubData
      );
      pendingBlocks.push(executeBlock);
      await diamondRollup.connect(operator).executeBlocks(pendingBlocks);
      // update state
      executedBlockNum += pendingBlocks.length;
    }

    // add total request number for consume after evacuation activated
    const user1 = accounts[1];
    const user1Addr = await user1.getAddress();
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await weth.connect(user1).approve(zkTrueUp.address, amount);
    await diamondAcc
      .connect(user1)
      .deposit(user1Addr, DEFAULT_ETH_ADDRESS, amount, {
        value: amount,
      });

    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    // collect deposit request public data
    const user1AccountId = await diamondAcc.getAccountId(user1Addr);
    const l2Amt = toL2Amt(amount, TS_BASE_TOKEN.ETH);
    const depositPubData = utils.solidityPack(
      ["uint8", "uint32", "uint16", "uint128"],
      [
        BigNumber.from(TsTxType.DEPOSIT),
        BigNumber.from(user1AccountId),
        BigNumber.from(TsTokenId.ETH),
        l2Amt,
      ]
    );
    const depositPubDataBytes = utils.hexlify(depositPubData);

    // consume l1 request
    await diamondRollup.consumeL1RequestInEvacuMode([depositPubDataBytes]);

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock1 = case01.newBlock;
    const evacuBlock2 = case02.newBlock;
    const evacuBlock3 = case03.newBlock;
    const evacuBlock4 = case04.newBlock;
    const proof1: ProofStruct = case01.proof as ProofStruct;
    const proof2: ProofStruct = case02.proof as ProofStruct;
    const proof3: ProofStruct = case03.proof as ProofStruct;
    const proof4: ProofStruct = case04.proof as ProofStruct;

    // evacuate
    await time.increaseTo(Number(evacuBlock1.timestamp));
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock1, proof1);
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock2, proof2);
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock3, proof3);
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock4, proof4);
  });

  it("Success to restore protocol", async function () {
    // before state
    const [
      beforeCommittedBlockNum,
      beforeVerifiedBlockNum,
      beforeExecutedBlockNum,
    ] = await diamondRollup.getBlockNum();
    const [
      beforeCommittedL1RequestNum,
      beforeExecutedL1RequestNum,
      beforeTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // generate new blocks
    const restoreBlock1Data = restoreData[0];
    const lastCommittedBlock = storedBlocks[committedBlockNum - 1];
    const blockNumber = BigNumber.from(lastCommittedBlock.blockNumber).add(1);
    const commitBlock: CommitBlockStruct = {
      blockNumber,
      newStateRoot: restoreBlock1Data.commitBlock.newFlowInfo.stateRoot,
      newTsRoot: restoreBlock1Data.commitBlock.newFlowInfo.tsRoot,
      publicData: restoreBlock1Data.commitBlock.o_chunk,
      chunkIdDeltas: restoreBlock1Data.commitBlock.chunkIdDeltas,
      timestamp: restoreBlock1Data.commitBlock.timestamp,
    };

    // commit evacu blocks
    await time.increaseTo(Number(commitBlock.timestamp));
    await diamondRollup
      .connect(operator)
      .commitEvacuBlocks(lastCommittedBlock, [commitBlock]);
    const storedBlock = {
      blockNumber,
      l1RequestNum: restoreBlock1Data.commitBlock.l1RequestNum,
      pendingRollupTxHash: restoreBlock1Data.commitBlock.pendingRollupTxHash,
      commitment: restoreBlock1Data.commitBlock.commitment,
      stateRoot: restoreBlock1Data.commitBlock.newFlowInfo.stateRoot,
      timestamp: restoreBlock1Data.commitBlock.timestamp,
    };

    storedBlocks.push(storedBlock);
    committedBlockNum += 1;

    // verify evacu blocks
    const committedBlocks: StoredBlockStruct[] = [];
    const committedBlock = storedBlocks[provedBlockNum];
    committedBlocks.push(committedBlock);

    const proof: ProofStruct = restoreBlock1Data.callData;

    const verifyingBlock: VerifyBlockStruct = {
      storedBlock: committedBlock,
      proof: proof,
    };

    await diamondRollup.connect(operator).verifyEvacuBlocks([verifyingBlock]);
    provedBlockNum += 1;

    const pendingRollupTxPubData = getPendingRollupTxPubData(restoreBlock1Data);
    const executeBlock = getExecuteBlock(
      storedBlocks[executedBlockNum],
      pendingRollupTxPubData
    );

    // execute evacu blocks
    await diamondRollup.connect(operator).executeEvacuBlocks([executeBlock]);
    executedBlockNum += 1;

    // check state
    // have not executed all evacuation request so the protocol is still in evacu mode
    expect(await diamondRollup.isEvacuMode()).to.be.true;

    // generate new blocks
    const restoreBlock2Data = restoreData[1];
    const lastCommittedBlock2 = storedBlocks[committedBlockNum - 1];
    const blockNumber2 = BigNumber.from(lastCommittedBlock2.blockNumber).add(1);
    const commitBlock2: CommitBlockStruct = {
      blockNumber: blockNumber2,
      newStateRoot: restoreBlock2Data.commitBlock.newFlowInfo.stateRoot,
      newTsRoot: restoreBlock2Data.commitBlock.newFlowInfo.tsRoot,
      publicData: restoreBlock2Data.commitBlock.o_chunk,
      chunkIdDeltas: restoreBlock2Data.commitBlock.chunkIdDeltas,
      timestamp: restoreBlock2Data.commitBlock.timestamp,
    };

    // commit evacu blocks
    await time.increaseTo(Number(commitBlock2.timestamp));
    await diamondRollup
      .connect(operator)
      .commitEvacuBlocks(lastCommittedBlock2, [commitBlock2]);
    const storedBlock2 = {
      blockNumber: blockNumber2,
      l1RequestNum: restoreBlock2Data.commitBlock.l1RequestNum,
      pendingRollupTxHash: restoreBlock2Data.commitBlock.pendingRollupTxHash,
      commitment: restoreBlock2Data.commitBlock.commitment,
      stateRoot: restoreBlock2Data.commitBlock.newFlowInfo.stateRoot,
      timestamp: restoreBlock2Data.commitBlock.timestamp,
    };

    storedBlocks.push(storedBlock2);
    committedBlockNum += 1;

    // verify evacu blocks
    const committedBlock2 = storedBlocks[provedBlockNum];
    const proof2: ProofStruct = restoreBlock2Data.callData;
    const verifyingBlock2: VerifyBlockStruct = {
      storedBlock: committedBlock2,
      proof: proof2,
    };

    await diamondRollup.connect(operator).verifyEvacuBlocks([verifyingBlock2]);
    provedBlockNum += 1;

    const pendingRollupTxPubData2 =
      getPendingRollupTxPubData(restoreBlock2Data);
    const executeBlock2 = getExecuteBlock(
      storedBlocks[executedBlockNum],
      pendingRollupTxPubData2
    );

    // execute evacu blocks
    const execuateEvacuBlock2Tx = await diamondRollup
      .connect(operator)
      .executeEvacuBlocks([executeBlock2]);
    executedBlockNum += 1;

    // after state
    const [
      afterCommittedBlockNum,
      afterVerifiedBlockNum,
      afterExecutedBlockNum,
    ] = await diamondRollup.getBlockNum();
    const [
      afterCommittedL1RequestNum,
      afterExecutedL1RequestNum,
      afterTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // check event
    await expect(execuateEvacuBlock2Tx).to.emit(
      diamondRollup,
      "EvacuModeDeactivation"
    );

    // check state
    expect(await diamondRollup.isEvacuMode()).to.be.false;
    expect(afterCommittedBlockNum - beforeCommittedBlockNum).to.equal(2);
    expect(afterVerifiedBlockNum - beforeVerifiedBlockNum).to.equal(2);
    expect(afterExecutedBlockNum - beforeExecutedBlockNum).to.equal(2);
    expect(
      afterCommittedL1RequestNum.sub(beforeCommittedL1RequestNum)
    ).to.equal(4);
    expect(afterExecutedL1RequestNum.sub(beforeExecutedL1RequestNum)).to.equal(
      4
    );
    expect(afterTotalL1RequestNum).to.equal(beforeTotalL1RequestNum);
  });
});

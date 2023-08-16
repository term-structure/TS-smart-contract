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
} from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";
import { toL2Amt } from "../../utils/amountConvertor";
import initStates from "../../data/rollupData/local-block-230808/initStates.json";
const testDataPath = resolve("./test/data/rollupData/local-block-230808");
const testData = initTestData(testDataPath);
const restoreDataPath = resolve("./test/data/rollupData/restoreData");
const restoreData = initTestData(restoreDataPath);
import _case01 from "../../data/rollupData/evacuateData/case01.json";
import _case02 from "../../data/rollupData/evacuateData/case02.json";
import _case03 from "../../data/rollupData/evacuateData/case03.json";
import _case04 from "../../data/rollupData/evacuateData/case04.json";

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

    const blocks = await diamondRollup.getBlockNum();

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
      const commitBlock = getCommitBlock(lastCommittedBlock, testCase);
      newBlocks.push(commitBlock);
      // commit blocks
      await diamondRollup
        .connect(operator)
        .commitBlocks(lastCommittedBlock, newBlocks);
      const storedBlock = getStoredBlock(commitBlock, testCase);
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
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock1, proof1);
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock2, proof2);
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock3, proof3);
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock4, proof4);
  });

  it("Success to restore protocol", async function () {
    // generate new blocks
    const lastCommittedBlock = storedBlocks[committedBlockNum - 1];
    const newBlocks: CommitBlockStruct[] = [];
    const commitBlock = getCommitBlock(lastCommittedBlock, restoreData[0]);
    newBlocks.push(commitBlock);

    // commit blocks
    await diamondRollup
      .connect(operator)
      .commitEvacuBlocks(lastCommittedBlock, newBlocks);
    const storedBlock = getStoredBlock(commitBlock, restoreData[0]);
    storedBlocks.push(storedBlock);
    // update state
    committedBlockNum += newBlocks.length;

    // verify blocks
    const committedBlocks: StoredBlockStruct[] = [];
    const committedBlock = storedBlocks[provedBlockNum];
    committedBlocks.push(committedBlock);

    const proofs: ProofStruct[] = [];
    const proof: ProofStruct = restoreData[0].callData;
    proofs.push(proof);

    const verifyingBlocks: VerifyBlockStruct[] = [];
    verifyingBlocks.push({
      storedBlock: committedBlock,
      proof: proof,
    });

    console.log({
      lastCommittedBlock,
      newBlocks,
      committedBlock,
      // commitBlock,
    });

    await diamondRollup.connect(operator).verifyEvacuBlocks(verifyingBlocks);
    provedBlockNum += committedBlocks.length;

    // execute blocks
    // const evacuBlocks = storedBlocks.slice(executedBlockNum);
    // await diamondRollup.connect(operator).executeEvacuBlocks(newBlocks);

  });
});

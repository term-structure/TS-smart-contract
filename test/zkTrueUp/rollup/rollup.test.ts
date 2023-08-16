import { BigNumber, utils, Signer } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { resolve } from "path";
import { EMPTY_HASH, TsTxType } from "term-structure-sdk";
import initStates from "../../data/rollupData/local-block-230808/initStates.json";
import { FACET_NAMES } from "../../../utils/config";
import { useFacet } from "../../../utils/useFacet";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { AccountState, BaseTokenAddresses } from "../../../utils/type";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  ProofStruct,
  StoredBlockStruct,
  VerifyBlockStruct,
} from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";
import {
  AccountFacet,
  ProtocolParamsFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  actionDispatcher,
  checkStates,
  doCreateBondToken,
  doDeposit,
  doForceWithdraw,
  doRegister,
  getCommitBlock,
  getExecuteBlock,
  getPendingRollupTxPubData,
  getStates,
  getStoredBlock,
  initTestData,
} from "../../utils/rollupHelper";
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

describe("Rollup", function () {
  const storedBlocks: StoredBlockStruct[] = [];
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
  let accounts: Signer[];
  let committedBlockNum = 0;
  let provedBlockNum = 0;
  let executedBlockNum = 0;
  let operator: Signer;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondProtocolParams: ProtocolParamsFacet;
  let diamondLoan: LoanFacet;
  let diamondRollup: RollupFacet;
  let diamondTsb: TsbFacet;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let oriStates: { [key: number]: AccountState } = {};

  before(async function () {
    const res = await loadFixture(fixture);
    operator = res.operator;
    zkTrueUp = res.zkTrueUp;
    accounts = await ethers.getSigners();
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondProtocolParams = (await useFacet(
      "ProtocolParamsFacet",
      zkTrueUpAddr
    )) as ProtocolParamsFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUpAddr)) as LoanFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    storedBlocks.push(genesisBlock);
    committedBlockNum = 1;
    provedBlockNum = 1;
    executedBlockNum = 1;
  });

  for (let k = 0; k < testData.length; k++) {
    const testCase = testData[k];
    it(`Before rollup for block-${k + 1}`, async function () {
      oriStates = await getStates(
        accounts,
        baseTokenAddresses,
        diamondProtocolParams,
        diamondLoan,
        diamondToken,
        diamondRollup,
        diamondTsb,
        testCase
      );
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
    });
    it(`Commit for block-${k + 1}`, async function () {
      // get last committed block
      const lastCommittedBlock = storedBlocks[committedBlockNum - 1];
      // generate new blocks
      const newBlocks: CommitBlockStruct[] = [];
      const commitBlock = getCommitBlock(lastCommittedBlock, testCase);
      newBlocks.push(commitBlock);
      // get state before commit
      const [oriCommittedBlockNum, ,] = await diamondRollup.getBlockNum();
      const [oriCommittedL1RequestNum, ,] =
        await diamondRollup.getL1RequestNum();
      // commit blocks
      await diamondRollup
        .connect(operator)
        .commitBlocks(lastCommittedBlock, newBlocks);
      const storedBlock = getStoredBlock(commitBlock, testCase);
      storedBlocks.push(storedBlock);
      // get state after commit
      const [newCommittedBlockNum, ,] = await diamondRollup.getBlockNum();
      const [newCommittedL1RequestNum, ,] =
        await diamondRollup.getL1RequestNum();
      // calculate state transition
      let committedL1RequestNum = BigNumber.from("0");
      for (let i = 0; i < newBlocks.length; i++) {
        committedL1RequestNum = committedL1RequestNum.add(
          BigNumber.from(storedBlocks[committedBlockNum + i].l1RequestNum)
        );
      }
      // verify state transition
      expect(newCommittedBlockNum - oriCommittedBlockNum).to.be.eq(
        newBlocks.length
      );
      expect(newCommittedL1RequestNum.sub(oriCommittedL1RequestNum)).to.be.eq(
        committedL1RequestNum
      );
      // update state
      committedBlockNum += newBlocks.length;
    });

    it(`Verify for block-${k + 1}`, async function () {
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

      const [, oriProvedBlockNum] = await diamondRollup.getBlockNum();
      await diamondRollup.connect(operator).verifyBlocks(verifyingBlocks);

      const [, newProvedBlockNum] = await diamondRollup.getBlockNum();
      expect(newProvedBlockNum - oriProvedBlockNum).to.be.eq(
        committedBlocks.length
      );

      provedBlockNum += committedBlocks.length;
    });

    it(`Execute for block-${k + 1}`, async function () {
      const pendingBlocks: ExecuteBlockStruct[] = [];
      const pendingRollupTxPubData = getPendingRollupTxPubData(testCase);
      const executeBlock = getExecuteBlock(
        storedBlocks[executedBlockNum],
        pendingRollupTxPubData
      );
      pendingBlocks.push(executeBlock);

      // get state before execute block
      const [, , oriExecutedBlockNum] = await diamondRollup.getBlockNum();
      const [, oriExecutedL1RequestId] = await diamondRollup.getL1RequestNum();
      // execute block
      await diamondRollup.connect(operator).executeBlocks(pendingBlocks);
      // get state after execute block
      const [, , newExecutedBlockNum] = await diamondRollup.getBlockNum();
      const [, newExecutedL1RequestId] = await diamondRollup.getL1RequestNum();
      // calculate state transition
      let executedL1RequestNum = BigNumber.from("0");
      for (let i = 0; i < pendingBlocks.length; i++) {
        executedL1RequestNum = executedL1RequestNum.add(
          BigNumber.from(pendingBlocks[i].storedBlock.l1RequestNum)
        );
      }
      // verify state transition
      expect(newExecutedBlockNum - oriExecutedBlockNum).to.be.eq(
        pendingBlocks.length
      );
      expect(newExecutedL1RequestId.sub(oriExecutedL1RequestId)).to.be.eq(
        executedL1RequestNum
      );
      // update state
      executedBlockNum += pendingBlocks.length;
    });

    it(`After rollup for block-${k + 1}`, async function () {
      const newStates = await getStates(
        accounts,
        baseTokenAddresses,
        diamondProtocolParams,
        diamondLoan,
        diamondToken,
        diamondRollup,
        diamondTsb,
        testCase
      );
      await checkStates(
        diamondToken,
        diamondLoan,
        diamondTsb,
        testCase,
        oriStates,
        newStates
      );
    });
  }
});

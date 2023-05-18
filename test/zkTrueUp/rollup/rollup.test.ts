import { BigNumber, utils, Signer } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { resolve } from "path";
import { EMPTY_HASH, TsTxType } from "term-structure-sdk";
// import initStates from '../../../data/rollupTestData/phase6-refactor-8-10-8-6-3-3-31/initStates.json';
import initStates from "../../data/rollupData/zkTrueUp-8-10-8-6-3-3-31/initStates.json";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  ProofStruct,
  StoredBlockStruct,
} from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";
import {
  AccountFacet,
  GovernanceFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  ZkTrueUp,
} from "../../../typechain-types";
import { FACET_NAMES } from "../../../utils/config";
import { useFacet } from "../../../utils/useFacet";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { AccountState, BaseTokenAddresses } from "../../../utils/type";
import {
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
// const testDataPath = resolve(
//   './test/data/rollupTestData/phase6-refactor-8-10-8-6-3-3-31',
// );
const testDataPath = resolve("./test/data/rollupData/zkTrueUp-8-10-8-6-3-3-31");

const testData = initTestData(testDataPath);

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
  let committedBlockNum: number = 0;
  let provedBlockNum: number = 0;
  let executedBlockNum: number = 0;
  let operator: Signer;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondGov: GovernanceFacet;
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
    diamondAcc = (await useFacet("AccountFacet", zkTrueUp)) as AccountFacet;
    diamondGov = (await useFacet(
      "GovernanceFacet",
      zkTrueUp
    )) as GovernanceFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUp)) as LoanFacet;
    diamondRollup = (await useFacet("RollupFacet", zkTrueUp)) as RollupFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUp)) as TsbFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUp)) as TokenFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    committedBlockNum += 1;
    provedBlockNum += 1;
    executedBlockNum += 1;
    storedBlocks.push(genesisBlock);
  });

  for (let k = 0; k < testData.length; k++) {
    // for (let k = 0; k < 6; k++) {
    const testCase = testData[k];
    it(`Before rollup for block-${k}`, async function () {
      oriStates = await getStates(
        accounts,
        baseTokenAddresses,
        diamondGov,
        diamondLoan,
        diamondToken,
        diamondRollup,
        diamondTsb,
        testCase
      );
      for (let i = 0; i < testCase.requests.reqData.length; i++) {
        const reqType = testCase.requests.reqData[i][0];
        if (reqType == TsTxType.REGISTER.toString()) {
          await doRegister(
            accounts,
            baseTokenAddresses,
            diamondAcc,
            testCase,
            i
          );
        } else if (reqType == TsTxType.DEPOSIT.toString()) {
          if (i > 0) {
            if (Number(testCase.requests.reqData[i - 1][0]) == 1) {
              continue;
            }
          }
          await doDeposit(
            accounts,
            baseTokenAddresses,
            diamondAcc,
            testCase,
            i
          );
        } else if (reqType == TsTxType.FORCE_WITHDRAW.toString()) {
          await doForceWithdraw(
            accounts,
            baseTokenAddresses,
            diamondAcc,
            testCase,
            i
          );
        } else if (reqType == TsTxType.CREATE_TSB_TOKEN.toString()) {
          await doCreateBondToken(
            operator,
            diamondToken,
            diamondTsb,
            testCase,
            i
          );
        }
      }
    });
    it(`Commit for block-${k}`, async function () {
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

    it(`Verify for block-${k}`, async function () {
      const committedBlocks: StoredBlockStruct[] = [];
      const committedBlock = storedBlocks[provedBlockNum];
      committedBlocks.push(committedBlock);

      const proofs: ProofStruct[] = [];
      const proof: ProofStruct = testCase.callData;
      proofs.push(proof);

      const [, oriProvedBlockNum] = await diamondRollup.getBlockNum();
      await diamondRollup
        .connect(operator)
        .verifyBlocks(committedBlocks, proofs);

      const [, newProvedBlockNum] = await diamondRollup.getBlockNum();
      expect(newProvedBlockNum - oriProvedBlockNum).to.be.eq(
        committedBlocks.length
      );

      provedBlockNum += committedBlocks.length;
    });

    it(`Execute for block-${k}`, async function () {
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

    it(`After rollup for block-${k}`, async function () {
      const newStates = await getStates(
        accounts,
        baseTokenAddresses,
        diamondGov,
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

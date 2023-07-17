import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, utils, Signer } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { resolve } from "path";
import { useFacet } from "../../../utils/useFacet";
import { deployAndInit } from "../../utils/deployAndInit";
import { FACET_NAMES } from "../../../utils/config";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import initStates from "../../data/rollupData/zkTrueUp-8-10-8-6-3-3-32/initStates.json";
import { AccountState, BaseTokenAddresses } from "../../../utils/type";
import {
  DEFAULT_ETH_ADDRESS,
  EMPTY_HASH,
  MIN_DEPOSIT_AMOUNT,
  TS_SYSTEM_DECIMALS,
  TsTxType,
} from "term-structure-sdk";
import {
  AccountFacet,
  ProtocolParamsFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  checkStates,
  doCreateBondToken,
  doDeposit,
  doForceWithdraw,
  doRegister,
  getCommitBlock,
  getDecimals,
  getExecuteBlock,
  getPendingRollupTxPubData,
  getStates,
  getStoredBlock,
  initEvacuationTestData,
  initTestData,
  readEvacuationPubData,
} from "../../utils/rollupHelper";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  ProofStruct,
  StoredBlockStruct,
  VerifyBlockStruct,
} from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";

const testDataPath = resolve("./test/data/rollupData/zkTrueUp-8-10-8-6-3-3-32");
const evacuationDataPath = resolve(
  "./test/data/rollupData/zkTrueUp-evacuation-8-10-8-6-3-3-32"
);
const testData = initTestData(testDataPath);
const evacuationData = initEvacuationTestData(evacuationDataPath);

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

describe("Evacuate", function () {
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
  let committedBlockNum: number = 0;
  let provedBlockNum: number = 0;
  let executedBlockNum: number = 0;
  let operator: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondProtocolParams: ProtocolParamsFacet;
  let diamondLoan: LoanFacet;
  let diamondRollup: RollupFacet;
  let diamondTsb: TsbFacet;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let oriStates: { [key: number]: AccountState } = {};

  beforeEach(async function () {
    const res = await loadFixture(fixture);
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

    for (let k = 0; k < 3; k++) {
      const testCase = testData[k];
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
      // before rollup
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
      // commit blocks
      // get last committed block
      const lastCommittedBlock = storedBlocks[committedBlockNum - 1];
      // generate new blocks
      const newBlocks: CommitBlockStruct[] = [];
      const commitBlock = getCommitBlock(lastCommittedBlock, testCase, false);
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

      const [, oriProvedBlockNum] = await diamondRollup.getBlockNum();
      await diamondRollup.connect(operator).verifyBlocks(verifyingBlocks);

      const [, newProvedBlockNum] = await diamondRollup.getBlockNum();
      expect(newProvedBlockNum - oriProvedBlockNum).to.be.eq(
        committedBlocks.length
      );

      provedBlockNum += committedBlocks.length;

      // execute blocks
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

      // after rollup
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
    }
  });

  it("Success to evacuate", async function () {
    // register
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
    expect(await diamondRollup.isEvacuMode()).to.equal(false);
    await diamondRollup.activateEvacuation();
    expect(await diamondRollup.isEvacuMode()).to.equal(true);

    const lastCommittedBlock = storedBlocks[committedBlockNum - 1];
    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const commitBlock = getCommitBlock(
      lastCommittedBlock,
      evacuationData[0],
      true
    );
    const evacuation = readEvacuationPubData(commitBlock.publicData.toString());
    const proof: ProofStruct = evacuationData[0].callData;

    const accountAddr = await diamondAcc.getAccountAddr(evacuation.accountId);
    const tokenId = Number(evacuation.tokenId);
    const tokenAddr = baseTokenAddresses[tokenId];
    const token = await ethers.getContractAt("IERC20", tokenAddr);
    const oriBalance = await token.balanceOf(accountAddr);

    await diamondRollup.evacuate(lastExecutedBlock, commitBlock, proof);

    const newBalance = await token.balanceOf(accountAddr);

    const tokenDecimals = getDecimals(tokenId);
    const evacuationAmt = BigNumber.from(evacuation.amount)
      .mul(BigNumber.from(10).pow(BigNumber.from(tokenDecimals)))
      .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));

    expect(newBalance.sub(oriBalance)).to.be.eq(evacuationAmt);
  });

  it("Failed to evacuate, not in evacu mode", async function () {
    const lastCommittedBlock = storedBlocks[committedBlockNum - 1];
    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const commitBlock = getCommitBlock(
      lastCommittedBlock,
      evacuationData[0],
      true
    );
    const proof: ProofStruct = evacuationData[0].callData;

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, commitBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "NotEvacuMode");
  });
});

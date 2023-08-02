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
import { BaseTokenAddresses } from "../../../utils/type";
import {
  DEFAULT_ETH_ADDRESS,
  EMPTY_HASH,
  MIN_DEPOSIT_AMOUNT,
  TS_BASE_TOKEN,
  TS_SYSTEM_DECIMALS,
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
  doCreateBondToken,
  doDeposit,
  doForceWithdraw,
  doRegister,
  getCommitBlock,
  getDecimals,
  getExecuteBlock,
  getPendingRollupTxPubData,
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
import { toL2Amt } from "../../utils/amountConvertor";

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

describe("Consume L1 Request in EvacuMode", function () {
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
  let diamondRollup: RollupFacet;
  let diamondTsb: TsbFacet;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;

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
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    const EXECUTE_BLOCK_NUMBER = 3;

    // commit, verify, execute 3 blocks for test
    for (let k = 0; k < EXECUTE_BLOCK_NUMBER; k++) {
      const testCase = testData[k];
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
    await diamondRollup.activateEvacuation();

    // before consume l1 request
    const [
      oldCommittedL1RequestNum,
      oldExecutedL1RequestNum,
      oldTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();
    // before user1 pending balance
    const beforeUser1EthPendingBalance = await diamondRollup.getPendingBalances(
      user1Addr,
      DEFAULT_ETH_ADDRESS
    );

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

    // after consume l1 request
    const [
      newCommittedL1RequestNum,
      newExecutedL1RequestNum,
      newTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();
    // after user1 pending balance
    const afterUser1EthPendingBalance = await diamondRollup.getPendingBalances(
      user1Addr,
      DEFAULT_ETH_ADDRESS
    );

    // check committed and executed request number
    expect(newCommittedL1RequestNum.sub(oldCommittedL1RequestNum)).to.be.eq(1);
    expect(newExecutedL1RequestNum.sub(oldExecutedL1RequestNum)).to.be.eq(1);
    expect(newCommittedL1RequestNum).to.equal(newExecutedL1RequestNum);
    expect(oldTotalL1RequestNum).to.equal(newTotalL1RequestNum);
    // check user1 pending balance
    expect(
      afterUser1EthPendingBalance.sub(beforeUser1EthPendingBalance)
    ).to.be.eq(amount);
  });
});

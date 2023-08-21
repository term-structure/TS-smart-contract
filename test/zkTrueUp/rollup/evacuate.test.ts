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
  readEvacuationPubData,
} from "../../utils/rollupHelper";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  ProofStruct,
  StoredBlockStruct,
  VerifyBlockStruct,
} from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";
import { toL1Amt, toL2Amt } from "../../utils/amountConvertor";
import initStates from "../../data/rollupData/rollup/initStates.json";
const testDataPath = resolve("./test/data/rollupData/rollup");
const testData = initTestData(testDataPath);
import _case01 from "../../data/rollupData/evacuate/case01.json";
import _case02 from "../../data/rollupData/evacuate/case02.json";
import _case03 from "../../data/rollupData/evacuate/case03.json";

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
  let diamondRollup: RollupFacet;
  let diamondTsb: TsbFacet;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let case01: typeof _case01;
  let case02: typeof _case02;
  let case03: typeof _case03;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    case01 = JSON.parse(JSON.stringify(_case01));
    case02 = JSON.parse(JSON.stringify(_case02));
    case03 = JSON.parse(JSON.stringify(_case03));
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
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
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
      const commitBlock = getCommitBlock(lastCommittedBlock, testCase);
      newBlocks.push(commitBlock);
      // commit blocks
      await diamondRollup
        .connect(operator)
        .commitBlocks(lastCommittedBlock, newBlocks);
      const storedBlock = getStoredBlock(commitBlock, testCase);
      storedBlocks.push(storedBlock);
      // calculate state transition
      let committedL1RequestNum = BigNumber.from("0");
      for (let i = 0; i < newBlocks.length; i++) {
        committedL1RequestNum = committedL1RequestNum.add(
          BigNumber.from(storedBlocks[committedBlockNum + i].l1RequestNum)
        );
      }
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
      // execute block
      await diamondRollup.connect(operator).executeBlocks(pendingBlocks);
      // calculate state transition
      let executedL1RequestNum = BigNumber.from("0");
      for (let i = 0; i < pendingBlocks.length; i++) {
        executedL1RequestNum = executedL1RequestNum.add(
          BigNumber.from(pendingBlocks[i].storedBlock.l1RequestNum)
        );
      }
      // update state
      executedBlockNum += pendingBlocks.length;
    }
  });

  it("Success to evacuate", async function () {
    let req = await diamondRollup.getL1RequestNum();
    // add deposit request in L1 request queue
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

    req = await diamondRollup.getL1RequestNum();

    // consume L1 request
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
    req = await diamondRollup.getL1RequestNum();

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock1 = case01.newBlock;
    const evacuBlock2 = case02.newBlock;
    const evacuBlock3 = case03.newBlock;
    const proof1: ProofStruct = case01.proof as ProofStruct;
    const proof2: ProofStruct = case02.proof as ProofStruct;
    const proof3: ProofStruct = case03.proof as ProofStruct;
    const evacuation1 = readEvacuationPubData(
      evacuBlock1.publicData.toString()
    );
    const evacuation2 = readEvacuationPubData(
      evacuBlock2.publicData.toString()
    );
    const evacuation3 = readEvacuationPubData(
      evacuBlock3.publicData.toString()
    );

    // before state
    const [
      beforeCommittedL1RequestNum,
      beforeExecutedL1RequestNum,
      beforeTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // before balance
    // user1 evacuate eth
    const account1Addr = await diamondAcc.getAccountAddr(evacuation1.accountId);
    const token1Id = Number(evacuation1.tokenId);
    const beforeUser1EthBalance = await user1.getBalance();
    // user2 evacuate wbtc
    const account2Addr = await diamondAcc.getAccountAddr(evacuation2.accountId);
    const token2Id = Number(evacuation2.tokenId);
    const token2Addr = baseTokenAddresses[token2Id];
    const token2 = await ethers.getContractAt("IERC20", token2Addr);
    const beforeUser2WbtcBalance = await token2.balanceOf(account2Addr);
    // user3 evacuate wbtc
    const account3Addr = await diamondAcc.getAccountAddr(evacuation3.accountId);
    const token3Id = Number(evacuation3.tokenId);
    const token3Addr = baseTokenAddresses[token3Id];
    const token3 = await ethers.getContractAt("IERC20", token3Addr);
    const beforeUser3WbtcBalance = await token3.balanceOf(account3Addr);

    // test 3 user evacuate
    const evacuateTx1 = await diamondRollup.evacuate(
      lastExecutedBlock,
      evacuBlock1,
      proof1
    );
    const evacuateTx2 = await diamondRollup.evacuate(
      lastExecutedBlock,
      evacuBlock2,
      proof2
    );
    const evacuateTx3 = await diamondRollup.evacuate(
      lastExecutedBlock,
      evacuBlock3,
      proof3
    );

    const evacuation1Amt = toL1Amt(evacuation1.amount, TS_BASE_TOKEN.ETH);
    const evacuation2Amt = toL1Amt(evacuation2.amount, TS_BASE_TOKEN.WBTC);
    const evacuation3Amt = toL1Amt(evacuation3.amount, TS_BASE_TOKEN.WBTC);
    // check event
    await expect(evacuateTx1)
      .to.emit(diamondRollup, "Evacuation")
      .withArgs(
        account1Addr,
        evacuation1.accountId,
        DEFAULT_ETH_ADDRESS,
        token1Id,
        evacuation1Amt
      );
    await expect(evacuateTx2)
      .to.emit(diamondRollup, "Evacuation")
      .withArgs(
        account2Addr,
        evacuation2.accountId,
        token2Addr,
        token2Id,
        evacuation2Amt
      );
    await expect(evacuateTx3)
      .to.emit(diamondRollup, "Evacuation")
      .withArgs(
        account3Addr,
        evacuation3.accountId,
        token3Addr,
        token3Id,
        evacuation3Amt
      );

    // after state
    const [
      afterCommittedL1RequestNum,
      afterExecutedL1RequestNum,
      afterTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // after balance
    const afterUser1EthBalance = await user1.getBalance();
    const afterUser2WbtcBalance = await token2.balanceOf(account2Addr);
    const afterUser3WbtcBalance = await token3.balanceOf(account3Addr);

    // check state
    expect(afterCommittedL1RequestNum).to.be.eq(beforeCommittedL1RequestNum);
    expect(afterExecutedL1RequestNum).to.be.eq(beforeExecutedL1RequestNum);
    expect(afterTotalL1RequestNum.sub(beforeTotalL1RequestNum)).to.be.eq(3);

    // check balance
    expect(afterUser1EthBalance.sub(beforeUser1EthBalance)).to.be.eq(
      evacuation1Amt
    );
    expect(afterUser2WbtcBalance.sub(beforeUser2WbtcBalance)).to.be.eq(
      evacuation2Amt
    );
    expect(afterUser3WbtcBalance.sub(beforeUser3WbtcBalance)).to.be.eq(
      evacuation3Amt
    );

    // check is evacuated
    expect(await diamondRollup.isEvacuted(account1Addr, token1Id)).to.be.true;
    expect(await diamondRollup.isEvacuted(account2Addr, token2Id)).to.be.true;
    expect(await diamondRollup.isEvacuted(account3Addr, token3Id)).to.be.true;
    // check evacuation request in L1 request queue
    expect(
      await diamondRollup.isEvacuationInL1RequestQueue(
        evacuation1,
        beforeTotalL1RequestNum
      )
    ).to.be.true;
    expect(
      await diamondRollup.isEvacuationInL1RequestQueue(
        evacuation2,
        beforeTotalL1RequestNum.add(1)
      )
    ).to.be.true;
    expect(
      await diamondRollup.isEvacuationInL1RequestQueue(
        evacuation3,
        beforeTotalL1RequestNum.add(2)
      )
    ).to.be.true;
  });

  it("Failed to evacuate, not in evacu mode", async function () {
    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock = case01.newBlock;
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "NotEvacuMode");
  });

  it("Failed to evacuate, not consume all L1 request", async function () {
    // add deposit request in L1 request queue
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

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock = case01.newBlock;
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "NotConsumedAllL1Requests");
  });

  it("Failed to evacuate, invalid last executed block", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    const invalidLastExecutedBlock = storedBlocks[executedBlockNum - 2]; // not last executed block
    const evacuBlock = case01.newBlock;
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondRollup.evacuate(invalidLastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "BlockHashIsNotEq");
  });

  it("Failed to evacuate, invalid block timestamp", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const invalidEvacuBlock = case01.newBlock;
    invalidEvacuBlock.timestamp = "0"; // invalid timestamp
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, invalidEvacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "InvalidBlockTimestamp");
  });

  it("Failed to evacuate, invalid block number", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const invalidEvacuBlock = case01.newBlock;
    invalidEvacuBlock.blockNumber = "1"; // invalid block number
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, invalidEvacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "InvalidBlockNum");
  });

  it("Failed to evacuate, invalid public data length", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const invalidEvacuBlock = case01.newBlock;
    invalidEvacuBlock.publicData = "0x012345";
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, invalidEvacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "InvalidPubDataLength");
  });

  it("Failed to evacuate, invalid commitment", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock = case01.newBlock;
    const invalidProof: ProofStruct = case01.proof as ProofStruct;
    invalidProof.commitment = [BigNumber.from("0x123456")];

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, evacuBlock, invalidProof)
    ).to.be.revertedWithCustomError(diamondRollup, "CommitmentInconsistant");
  });

  it("Failed to evacuate, invalid proof", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock = case01.newBlock;
    const invalidProof: ProofStruct = case01.proof as ProofStruct;
    invalidProof.a[0] = BigNumber.from("0x123456");

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, evacuBlock, invalidProof)
    ).to.be.revertedWithCustomError(diamondRollup, "InvalidProof");
  });

  it("Failed to evacuate, the specified user and token is already evacuated", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock = case01.newBlock;
    const proof: ProofStruct = case01.proof as ProofStruct;
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock, proof);
    // evacuate again
    await expect(
      diamondRollup.evacuate(lastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "Evacuated");
  });
});

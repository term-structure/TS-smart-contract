import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, utils, Signer } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { resolve } from "path";
import { useFacet } from "../../../utils/useFacet";
import { deployAndInit } from "../../utils/deployAndInit";
import { FACET_NAMES } from "../../../utils/config";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { AccountState, BaseTokenAddresses } from "../../../utils/type";
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
import initStates from "../../data/rollupData/local-block-230808/initStates.json";
const testDataPath = resolve("./test/data/rollupData/local-block-230808");
// const evacuationDataPath = resolve("./test/data/rollupData/local-block-230808");
const testData = initTestData(testDataPath);
// const evacuationData = initEvacuationTestData(evacuationDataPath);
import case01 from "../../data/rollupData/evacuateData/case01.json";
import case02 from "../../data/rollupData/evacuateData/case02.json";
import case03 from "../../data/rollupData/evacuateData/case03.json";
import { toL1Amt, toL2Amt } from "../../utils/amountConvertor";

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

    for (let k = 0; k < 4; k++) {
      const testCase = testData[k];
      // before rollup
      for (let i = 0; i < testCase.reqDataList.length; i++) {
        const reqType = testCase.reqDataList[i][0];
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
            if (Number(testCase.reqDataList[i - 1][0]) == 1) {
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

    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock1 = case01.newBlock;
    const evacuBlock2 = case02.newBlock;
    const evacuBlock3 = case03.newBlock;
    // const proof: ProofStruct = {
    //   a: [case01.proof.a[0], case01.proof.a[1]],
    //   b: [
    //     [case01.proof.b[0][0], case01.proof.b[0][1]],
    //     [case01.proof.b[1][0], case01.proof.b[1][1]],
    //   ],
    //   c: [case01.proof.c[0], case01.proof.c[1]],
    //   commitment: [case01.proof.commitment[0]],
    // };
    const proof1: ProofStruct = case01.proof;
    const proof2: ProofStruct = case02.proof;
    const proof3: ProofStruct = case03.proof;
    // console.log("proof", proof);
    const evacuation1 = readEvacuationPubData(
      evacuBlock1.publicData.toString()
    );
    const evacuation2 = readEvacuationPubData(
      evacuBlock2.publicData.toString()
    );
    const evacuation3 = readEvacuationPubData(
      evacuBlock3.publicData.toString()
    );

    // before balance
    // user1 evacuate eth
    const beforeUser1EthBalance = await user1.getBalance();
    // user2 evacuate wbtc
    const account2 = await diamondAcc.getAccountAddr(evacuation2.accountId);
    const token2Id = Number(evacuation2.tokenId);
    const token2Addr = baseTokenAddresses[token2Id];
    const wbtc = await ethers.getContractAt("IERC20", token2Addr);
    const beforeUser2WbtcBalance = await wbtc.balanceOf(account2);
    // user3 evacuate wbtc
    const account3 = await diamondAcc.getAccountAddr(evacuation3.accountId);
    const beforeUser3WbtcBalance = await wbtc.balanceOf(account3);

    // test 3 user evacuate
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock1, proof1);
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock2, proof2);
    await diamondRollup.evacuate(lastExecutedBlock, evacuBlock3, proof3);

    // after balance
    const afterUser1EthBalance = await user1.getBalance();
    const afterUser2WbtcBalance = await wbtc.balanceOf(account2);
    const afterUser3WbtcBalance = await wbtc.balanceOf(account3);

    const evacuation1Amt = toL1Amt(evacuation1.amount, TS_BASE_TOKEN.ETH);
    const evacuation2Amt = toL1Amt(evacuation2.amount, TS_BASE_TOKEN.WBTC);
    const evacuation3Amt = toL1Amt(evacuation3.amount, TS_BASE_TOKEN.WBTC);
    expect(afterUser1EthBalance.sub(beforeUser1EthBalance)).to.be.eq(
      evacuation1Amt
    );
    expect(afterUser2WbtcBalance.sub(beforeUser2WbtcBalance)).to.be.eq(
      evacuation2Amt
    );
    expect(afterUser3WbtcBalance.sub(beforeUser3WbtcBalance)).to.be.eq(
      evacuation3Amt
    );
  });

  it("Failed to evacuate, not in evacu mode", async function () {
    const lastExecutedBlock = storedBlocks[executedBlockNum - 1];
    const evacuBlock = case01.newBlock;
    const proof = case01.proof;

    await expect(
      diamondRollup.evacuate(lastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondRollup, "NotEvacuMode");
  });
});

import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, utils, Signer, Wallet } from "ethers";
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
  TsTokenId,
  TsTxType,
  getTsRollupSignerFromWallet,
} from "term-structure-sdk";
import {
  AccountFacet,
  ERC20Mock,
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
import { genTsAddr } from "../../utils/helper";

const testDataPath = resolve("./test/data/rollupData/zkTrueUp-8-10-8-6-3-3-32");
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
  let usdc: ERC20Mock;

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
  });

  it("Success to consume  L1 request", async function () {
    const user1 = accounts[1];
    const user1Addr = await user1.getAddress();
    await weth
      .connect(user1)
      .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    // register
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
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

  it("Success to consume all L1 requests in multiple batch", async function () {
    const user1 = accounts[1];
    const user1Addr = await user1.getAddress();
    const user2 = accounts[2];
    const user2Addr = await user2.getAddress();

    await weth
      .connect(user1)
      .approve(zkTrueUp.address, ethers.constants.MaxUint256);

    usdc = (await ethers.getContractAt(
      "ERC20Mock",
      baseTokenAddresses[TsTokenId.USDC]
    )) as ERC20Mock;
    await usdc
      .connect(user2)
      .mint(user2Addr, utils.parseUnits("10000", TS_BASE_TOKEN.USDC.decimals));

    // approve usdc to zkTrueUp
    await usdc
      .connect(user2)
      .approve(zkTrueUp.address, ethers.constants.MaxUint256);

    // Add 4 L1 requests after last committed request
    // 1. user1 deposit
    const user1DepositAmt = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await diamondAcc
      .connect(user1)
      .deposit(user1Addr, DEFAULT_ETH_ADDRESS, user1DepositAmt, {
        value: user1DepositAmt,
      });

    // 2. user1 force withdraw
    await diamondAcc.connect(user1).forceWithdraw(DEFAULT_ETH_ADDRESS);

    // 3. user2 register (register request + deposit request)
    // 4. user2 deposit
    const chainId = Number((await user1.getChainId()).toString());
    const tsSigner = await getTsRollupSignerFromWallet(
      chainId,
      diamondAcc.address,
      user2 as Wallet
    );
    const tsPubKey = {
      X: tsSigner.tsPubKey[0].toString(),
      Y: tsSigner.tsPubKey[1].toString(),
    };
    const user2RegisterAmt = utils.parseUnits(
      MIN_DEPOSIT_AMOUNT.USDC.toString(),
      TS_BASE_TOKEN.USDC.decimals
    );
    await diamondAcc
      .connect(user2)
      .register(tsPubKey.X, tsPubKey.Y, usdc.address, user2RegisterAmt);

    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondRollup.activateEvacuation();

    // before consume l1 request
    const [
      oldCommittedL1RequestNum,
      oldExecutedL1RequestNum,
      oldTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();
    // before pending balance
    const beforeUser1EthPendingBalance = await diamondRollup.getPendingBalances(
      user1Addr,
      DEFAULT_ETH_ADDRESS
    );
    const beforeUser2UsdcPendingBalance =
      await diamondRollup.getPendingBalances(user2Addr, usdc.address);

    // collect user1 deposit request public data
    const user1AccountId = await diamondAcc.getAccountId(user1Addr);
    const user1DepositL2Amt = toL2Amt(user1DepositAmt, TS_BASE_TOKEN.ETH);
    const user1DepositPubData = utils.solidityPack(
      ["uint8", "uint32", "uint16", "uint128"],
      [
        BigNumber.from(TsTxType.DEPOSIT),
        BigNumber.from(user1AccountId),
        BigNumber.from(TsTokenId.ETH),
        user1DepositL2Amt,
      ]
    );
    const user1DepositPubDataBytes = utils.hexlify(user1DepositPubData);

    // collect user1 force withdraw request public data
    const user1ForceWithdrawPubData = utils.solidityPack(
      ["uint8", "uint32", "uint16", "uint128"],
      [
        BigNumber.from(TsTxType.FORCE_WITHDRAW),
        BigNumber.from(user1AccountId),
        BigNumber.from(TsTokenId.ETH),
        0,
      ]
    );
    const user1ForceWithdrawPubDataBytes = utils.hexlify(
      user1ForceWithdrawPubData
    );

    // collect user2 register request public data
    const user2AccountId = await diamondAcc.getAccountId(user2Addr);
    const tsAddr = genTsAddr(
      BigNumber.from(tsPubKey.X),
      BigNumber.from(tsPubKey.Y)
    );
    const user2RegisterPubData = utils.solidityPack(
      ["uint8", "uint32", "bytes20"],
      [
        BigNumber.from(TsTxType.REGISTER),
        BigNumber.from(user2AccountId),
        tsAddr,
      ]
    );
    const user2RegisterPubDataBytes = utils.hexlify(user2RegisterPubData);

    // collect user2 deposit request public data
    const user2DepositL2Amt = toL2Amt(user2RegisterAmt, TS_BASE_TOKEN.USDC);
    const user2DepositPubData = utils.solidityPack(
      ["uint8", "uint32", "uint16", "uint128"],
      [
        BigNumber.from(TsTxType.DEPOSIT),
        BigNumber.from(user2AccountId),
        BigNumber.from(TsTokenId.USDC),
        user2DepositL2Amt,
      ]
    );
    const user2DepositPubDataBytes = utils.hexlify(user2DepositPubData);

    // consume all l1 requests in two batches
    await diamondRollup.consumeL1RequestInEvacuMode([
      user1DepositPubDataBytes,
      user1ForceWithdrawPubDataBytes,
    ]);
    await diamondRollup.consumeL1RequestInEvacuMode([
      user2RegisterPubDataBytes,
      user2DepositPubDataBytes,
    ]);

    // after consume all l1 requests
    const [
      newCommittedL1RequestNum,
      newExecutedL1RequestNum,
      newTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();
    // after pending balance
    const afterUser1EthPendingBalance = await diamondRollup.getPendingBalances(
      user1Addr,
      DEFAULT_ETH_ADDRESS
    );
    const afterUser2UsdcPendingBalance = await diamondRollup.getPendingBalances(
      user2Addr,
      usdc.address
    );

    // check committed and executed request number
    expect(newCommittedL1RequestNum.sub(oldCommittedL1RequestNum)).to.be.eq(4);
    expect(newExecutedL1RequestNum.sub(oldExecutedL1RequestNum)).to.be.eq(4);
    expect(newCommittedL1RequestNum).to.equal(newExecutedL1RequestNum);
    expect(oldTotalL1RequestNum).to.equal(newTotalL1RequestNum);
    // check pending balance
    expect(
      afterUser1EthPendingBalance.sub(beforeUser1EthPendingBalance)
    ).to.be.eq(user1DepositAmt);
    expect(
      afterUser2UsdcPendingBalance.sub(beforeUser2UsdcPendingBalance)
    ).to.be.eq(user2RegisterAmt);
  });

  it("Fail to consume L1 request, not in evacuation mode", async function () {
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
    await expect(
      diamondRollup.consumeL1RequestInEvacuMode([depositPubDataBytes])
    ).to.be.revertedWithCustomError(diamondRollup, "NotEvacuMode");
  });

  it("Fail to consume L1 request, invalid public data length", async function () {
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

    // consume l1 request, input length = 2, but only 1 request
    await expect(
      diamondRollup.consumeL1RequestInEvacuMode([
        depositPubDataBytes,
        depositPubDataBytes,
      ])
    ).to.be.revertedWithCustomError(
      diamondRollup,
      "ConsumedRequestNumExceedTotalNum"
    );
  });

  it("Fail to consume L1 request, invalid public data", async function () {
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

    // collect deposit request public data
    const user1AccountId = await diamondAcc.getAccountId(user1Addr);
    const l2Amt = toL2Amt(amount, TS_BASE_TOKEN.ETH);
    const invalidDepositPubData = utils.solidityPack(
      ["uint8", "uint32", "uint16", "uint128"],
      [
        BigNumber.from(TsTxType.REGISTER), // invalid type
        BigNumber.from(user1AccountId),
        BigNumber.from(TsTokenId.ETH),
        l2Amt,
      ]
    );
    const invalidDepositPubDataBytes = utils.hexlify(invalidDepositPubData);

    // consume l1 request
    await expect(
      diamondRollup.consumeL1RequestInEvacuMode([invalidDepositPubDataBytes])
    ).to.be.revertedWithCustomError(diamondRollup, "InvalidConsumedPubData");
  });
});

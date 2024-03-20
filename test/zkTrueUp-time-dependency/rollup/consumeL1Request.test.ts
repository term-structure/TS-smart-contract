import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, utils, Signer, Wallet } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
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
  getTsRollupSignerFromWallet,
} from "term-structure-sdk";
import {
  AccountFacet,
  ERC20Mock,
  EvacuationFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import { StoredBlockStruct } from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";
import { toL2Amt } from "../../utils/amountConvertor";
import { genTsAddr } from "../../utils/helper";
import { rollupData } from "../../data/rollup/test_data";
import {
  Users,
  preprocessAndRollupBlocks,
} from "../../utils/rollBorrowRollupHelper";

const initStateRoot = utils.hexZeroPad(
  utils.hexlify(BigInt(rollupData.initState.stateRoot)),
  32
);

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES, false, undefined, initStateRoot);
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
    stateRoot: initStateRoot,
    l1RequestNum: BigNumber.from("0"),
    pendingRollupTxHash: EMPTY_HASH,
    commitment: ethers.utils.defaultAbiCoder.encode(
      ["bytes32"],
      [String("0x").padEnd(66, "0")]
    ),
    timestamp: BigNumber.from("0"),
  };
  let accounts: Users;
  let operator: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondRollup: RollupFacet;
  let diamondTsb: TsbFacet;
  let diamondToken: TokenFacet;
  let diamondEvacuation: EvacuationFacet;
  let diamondLoan: LoanFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let usdc: ERC20Mock;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    storedBlocks = [];
    storedBlocks.push(genesisBlock);
    operator = res.operator;
    weth = res.weth;
    accounts = new Users(await ethers.getSigners());
    rollupData.user_data.forEach((user) =>
      accounts.addUser(user.tsPubKeyX, user.tsPubKeyY)
    );
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondEvacuation = (await useFacet(
      "EvacuationFacet",
      zkTrueUpAddr
    )) as EvacuationFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    const EXECUTED_BLOCK_NUM = 3;

    // preprocess tx and rollup the first 3 blocks
    const latestStoredBlock = await preprocessAndRollupBlocks(
      EXECUTED_BLOCK_NUM,
      rollupData,
      diamondAcc,
      diamondRollup,
      diamondTsb,
      diamondToken,
      diamondLoan,
      operator,
      accounts,
      baseTokenAddresses,
      genesisBlock
    );
  });

  it("Success to consume L1 request", async function () {
    const user1 = accounts.getUser(1);
    const user1Addr = await user1.getAddr();
    await weth
      .connect(user1.signer)
      .approve(zkTrueUp.address, ethers.constants.MaxUint256);
    // register
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await diamondAcc
      .connect(user1.signer)
      .deposit(user1Addr, DEFAULT_ETH_ADDRESS, amount, {
        value: amount,
      });
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

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
    await diamondEvacuation.consumeL1RequestInEvacuMode([depositPubDataBytes]);

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
    const user1 = accounts.getUser(1);
    const user1Addr = await user1.getAddr();
    const newUser = accounts.getUser(3);
    const newUserAddr = await newUser.getAddr();

    await weth
      .connect(user1.signer)
      .approve(zkTrueUp.address, ethers.constants.MaxUint256);

    usdc = (await ethers.getContractAt(
      "ERC20Mock",
      baseTokenAddresses[TsTokenId.USDC]
    )) as ERC20Mock;
    await usdc
      .connect(newUser.signer)
      .mint(
        newUserAddr,
        utils.parseUnits("10000", TS_BASE_TOKEN.USDC.decimals)
      );

    // approve usdc to zkTrueUp
    await usdc
      .connect(newUser.signer)
      .approve(zkTrueUp.address, ethers.constants.MaxUint256);

    // Add 4 L1 requests after last committed request
    // 1. user1 deposit
    const user1DepositAmt = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await diamondAcc
      .connect(user1.signer)
      .deposit(user1Addr, DEFAULT_ETH_ADDRESS, user1DepositAmt, {
        value: user1DepositAmt,
      });

    // 2. user1 force withdraw
    await diamondAcc.connect(user1.signer).forceWithdraw(DEFAULT_ETH_ADDRESS);

    // 3. new user register (register request + deposit request)
    // 4. new user deposit
    const chainId = Number((await user1.signer.getChainId()).toString());
    const tsSigner = await getTsRollupSignerFromWallet(
      chainId,
      diamondAcc.address,
      newUser.signer as Wallet
    );
    const tsPubKey = {
      X: tsSigner.tsPubKey[0].toString(),
      Y: tsSigner.tsPubKey[1].toString(),
    };
    const newUserRegisterAmt = utils.parseUnits(
      MIN_DEPOSIT_AMOUNT.USDC.toString(),
      TS_BASE_TOKEN.USDC.decimals
    );
    await diamondAcc
      .connect(newUser.signer)
      .register(tsPubKey.X, tsPubKey.Y, usdc.address, newUserRegisterAmt);

    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

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
    const beforeNewUserUsdcPendingBalance =
      await diamondRollup.getPendingBalances(newUserAddr, usdc.address);
    // before account state
    const beforeNewUserAccountId = await diamondAcc.getAccountId(newUserAddr);

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

    // collect new user register request public data
    const newUserAccountId = await diamondAcc.getAccountId(newUserAddr);
    const tsAddr = genTsAddr(
      BigNumber.from(tsPubKey.X),
      BigNumber.from(tsPubKey.Y)
    );
    const newUserRegisterPubData = utils.solidityPack(
      ["uint8", "uint32", "bytes20"],
      [
        BigNumber.from(TsTxType.REGISTER),
        BigNumber.from(newUserAccountId),
        tsAddr,
      ]
    );
    const newUserRegisterPubDataBytes = utils.hexlify(newUserRegisterPubData);

    // collect new user deposit request public data
    const newUserDepositL2Amt = toL2Amt(newUserRegisterAmt, TS_BASE_TOKEN.USDC);
    const newUserDepositPubData = utils.solidityPack(
      ["uint8", "uint32", "uint16", "uint128"],
      [
        BigNumber.from(TsTxType.DEPOSIT),
        BigNumber.from(newUserAccountId),
        BigNumber.from(TsTokenId.USDC),
        newUserDepositL2Amt,
      ]
    );
    const newUserDepositPubDataBytes = utils.hexlify(newUserDepositPubData);

    // consume all l1 requests in two batches
    await diamondEvacuation.consumeL1RequestInEvacuMode([
      user1DepositPubDataBytes,
      user1ForceWithdrawPubDataBytes,
    ]);
    await diamondEvacuation.consumeL1RequestInEvacuMode([
      newUserRegisterPubDataBytes,
      newUserDepositPubDataBytes,
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
    const afterNewUserUsdcPendingBalance =
      await diamondRollup.getPendingBalances(newUserAddr, usdc.address);
    // after account state
    const afterNewUserAccountId = await diamondAcc.getAccountId(newUserAddr);

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
      afterNewUserUsdcPendingBalance.sub(beforeNewUserUsdcPendingBalance)
    ).to.be.eq(newUserRegisterAmt);
    // check account state
    expect(afterNewUserAccountId).to.be.eq(0);

    // check user1 successfully withdraw after consume l1 request
    await diamondAcc
      .connect(user1.signer)
      .withdraw(await user1.getAddr(), DEFAULT_ETH_ADDRESS, user1DepositAmt);

    // check new user successfully refund after consume l1 request
    await diamondEvacuation
      .connect(newUser.signer)
      .refundDeregisteredAddr(
        usdc.address,
        newUserRegisterAmt,
        newUserAccountId
      );
  });

  it("Fail to consume L1 request, not in evacuation mode", async function () {
    // register
    const user1 = accounts.getUser(1);
    const user1Addr = await user1.getAddr();
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await weth.connect(user1.signer).approve(zkTrueUp.address, amount);
    await diamondAcc
      .connect(user1.signer)
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
      diamondEvacuation.consumeL1RequestInEvacuMode([depositPubDataBytes])
    ).to.be.revertedWithCustomError(diamondEvacuation, "NotEvacuMode");
  });

  it("Fail to consume L1 request, invalid public data length", async function () {
    // register
    const user1 = accounts.getUser(1);
    const user1Addr = await user1.getAddr();
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await weth.connect(user1.signer).approve(zkTrueUp.address, amount);
    await diamondAcc
      .connect(user1.signer)
      .deposit(user1Addr, DEFAULT_ETH_ADDRESS, amount, {
        value: amount,
      });
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

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
      diamondEvacuation.consumeL1RequestInEvacuMode([
        depositPubDataBytes,
        depositPubDataBytes,
      ])
    ).to.be.revertedWithCustomError(
      diamondEvacuation,
      "ConsumedRequestNumExceedTotalNum"
    );
  });

  it("Fail to consume L1 request, invalid public data", async function () {
    // register
    const user1 = accounts.getUser(1);
    const user1Addr = await user1.getAddr();
    const amount = utils.parseEther(MIN_DEPOSIT_AMOUNT.ETH.toString());
    await weth.connect(user1.signer).approve(zkTrueUp.address, amount);
    await diamondAcc
      .connect(user1.signer)
      .deposit(user1Addr, DEFAULT_ETH_ADDRESS, amount, {
        value: amount,
      });
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

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
      diamondEvacuation.consumeL1RequestInEvacuMode([
        invalidDepositPubDataBytes,
      ])
    ).to.be.revertedWithCustomError(
      diamondEvacuation,
      "InvalidConsumedPubData"
    );
  });
});

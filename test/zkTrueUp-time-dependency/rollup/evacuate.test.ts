import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, utils, Signer } from "ethers";
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
} from "term-structure-sdk";
import {
  AccountFacet,
  EvacuationFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  TsbToken,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import { readEvacuationPubData } from "../../utils/rollupHelper";
import {
  ProofStruct,
  StoredBlockStruct,
} from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";
import { toL1Amt, toL2Amt } from "../../utils/amountConvertor";
import { rollupData } from "../../data/rollup/test_data";
import {
  Users,
  preprocessAndRollupBlocks,
} from "../../utils/rollBorrowRollupHelper";
import _case01 from "../../data/rollup/000.evacu_calldata.json";
import _case02 from "../../data/rollup/001.evacu_calldata.json";
import _case05 from "../../data/rollup/004.evacu_calldata.json";

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

describe("Evacuate", function () {
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
  let case01: typeof _case01;
  let case02: typeof _case02;
  let case05: typeof _case05;
  let latestStoredBlock: StoredBlockStruct;

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    case01 = JSON.parse(JSON.stringify(_case01));
    case02 = JSON.parse(JSON.stringify(_case02));
    case05 = JSON.parse(JSON.stringify(_case05));
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
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondEvacuation = (await useFacet(
      "EvacuationFacet",
      zkTrueUpAddr
    )) as EvacuationFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUpAddr)) as LoanFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    const EXECUTED_BLOCK_NUM = 21;

    latestStoredBlock = await preprocessAndRollupBlocks(
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

  it("Success to evacuate", async function () {
    let req = await diamondRollup.getL1RequestNum();
    // add deposit request in L1 request queue
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
    await diamondEvacuation.consumeL1RequestInEvacuMode([depositPubDataBytes]);
    req = await diamondRollup.getL1RequestNum();

    const evacuData1 = case01;
    const evacuData2 = case02;
    const evacuData3 = case05;
    const proof1: ProofStruct = case01.proof as ProofStruct;
    const proof2: ProofStruct = case02.proof as ProofStruct;
    const proof3: ProofStruct = case05.proof as ProofStruct;
    const evacuation1 = readEvacuationPubData(
      case01.newBlock.publicData.toString()
    );
    const evacuation2 = readEvacuationPubData(
      evacuData2.newBlock.publicData.toString()
    );
    const evacuation3 = readEvacuationPubData(
      evacuData3.newBlock.publicData.toString()
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
    // user2 evacuate wbtc
    const account2Addr = await diamondAcc.getAccountAddr(evacuation2.accountId);
    const token2Id = Number(evacuation2.tokenId);
    const token2Addr = baseTokenAddresses[token2Id];
    const token2 = await ethers.getContractAt("IERC20", token2Addr);
    const beforeUser2WbtcBalance = await token2.balanceOf(account2Addr);

    // user3 evacuate tsb token
    const account3Addr = await diamondAcc.getAccountAddr(evacuation3.accountId);
    const tsbTokenId = Number(evacuation3.tokenId);
    const tsbTokenAddr = (await diamondToken.getAssetConfig(tsbTokenId)).token;
    const tsbToken = (await ethers.getContractAt(
      "TsbToken",
      tsbTokenAddr
    )) as TsbToken;
    const beforeUser3TsbBalance = await tsbToken.balanceOf(account3Addr);
    const beforeTsbTotalSupply = await tsbToken.totalSupply();

    const lastExecutedBlock = latestStoredBlock;
    // test 3 user evacuate
    time.increaseTo(Number(evacuData1.newBlock.timestamp));
    const evacuateTx1 = await diamondEvacuation
      .connect(user1.signer)
      .evacuate(lastExecutedBlock, evacuData1.newBlock, proof1);
    await evacuateTx1.wait();

    time.increaseTo(Number(evacuData2.newBlock.timestamp));
    const evacuateTx2 = await diamondEvacuation.evacuate(
      lastExecutedBlock,
      evacuData2.newBlock,
      proof2
    );
    await evacuateTx2.wait();

    time.increaseTo(Number(evacuData3.newBlock.timestamp));
    const evacuateTx3 = await diamondEvacuation.evacuate(
      lastExecutedBlock,
      evacuData3.newBlock,
      proof3
    );
    await evacuateTx3.wait();

    const evacuation1Amt = toL1Amt(evacuation1.amount, TS_BASE_TOKEN.ETH);
    const evacuation2Amt = toL1Amt(evacuation2.amount, TS_BASE_TOKEN.WBTC);
    // tsb token's L1 and L2 decimals are same
    const evacuation3Amt = evacuation3.amount;
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
        tsbTokenAddr,
        tsbTokenId,
        evacuation3Amt
      );

    // after state
    const [
      afterCommittedL1RequestNum,
      afterExecutedL1RequestNum,
      afterTotalL1RequestNum,
    ] = await diamondRollup.getL1RequestNum();

    // after balance
    const afterUser2WbtcBalance = await token2.balanceOf(account2Addr);
    const afterUser3TsbBalance = await tsbToken.balanceOf(account3Addr);
    const afterTsbTotalSupply = await tsbToken.totalSupply();

    // check state
    expect(afterCommittedL1RequestNum).to.be.eq(beforeCommittedL1RequestNum);
    expect(afterExecutedL1RequestNum).to.be.eq(beforeExecutedL1RequestNum);
    expect(afterTotalL1RequestNum.sub(beforeTotalL1RequestNum)).to.be.eq(3);

    // check balance
    expect(afterUser2WbtcBalance.sub(beforeUser2WbtcBalance)).to.be.eq(
      evacuation2Amt
    );
    expect(afterUser3TsbBalance.sub(beforeUser3TsbBalance)).to.be.eq(
      evacuation3Amt
    );
    expect(afterTsbTotalSupply.sub(beforeTsbTotalSupply)).to.be.eq(
      evacuation3Amt
    );

    // check is evacuated
    expect(await diamondEvacuation.isEvacuted(account1Addr, token1Id)).to.be
      .true;
    expect(await diamondEvacuation.isEvacuted(account2Addr, token2Id)).to.be
      .true;
    expect(await diamondEvacuation.isEvacuted(account3Addr, tsbTokenId)).to.be
      .true;
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
    const lastExecutedBlock = latestStoredBlock;
    const evacuBlock = case01.newBlock;
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondEvacuation.evacuate(lastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondEvacuation, "NotEvacuMode");
  });

  it("Failed to evacuate, not consume all L1 request", async function () {
    // add deposit request in L1 request queue
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

    const lastExecutedBlock = latestStoredBlock;
    const evacuBlock = case01.newBlock;
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondEvacuation.evacuate(lastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(
      diamondEvacuation,
      "NotConsumedAllL1Requests"
    );
  });

  it("Failed to evacuate, invalid last executed block", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

    const invalidLastExecutedBlock = storedBlocks[0]; // not last executed block
    const evacuBlock = case01.newBlock;
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondEvacuation.evacuate(invalidLastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondEvacuation, "BlockHashIsNotEq");
  });

  it("Failed to evacuate, invalid block timestamp", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

    const lastExecutedBlock = latestStoredBlock;
    const invalidEvacuBlock = case01.newBlock;
    invalidEvacuBlock.timestamp = "0"; // invalid timestamp
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondEvacuation.evacuate(lastExecutedBlock, invalidEvacuBlock, proof)
    ).to.be.revertedWithCustomError(
      diamondEvacuation,
      "TimestampLtPreviousBlock"
    );
  });

  it("Failed to evacuate, invalid block number", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

    const lastExecutedBlock = latestStoredBlock;
    const invalidEvacuBlock = case01.newBlock;
    invalidEvacuBlock.blockNumber = 1; // invalid block number
    const proof: ProofStruct = case01.proof as ProofStruct;

    await expect(
      diamondEvacuation.evacuate(lastExecutedBlock, invalidEvacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondEvacuation, "InvalidBlockNum");
  });

  it("Failed to evacuate, invalid public data length", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

    const lastExecutedBlock = latestStoredBlock;
    const invalidEvacuBlock = case01.newBlock;
    invalidEvacuBlock.publicData = "0x012345";
    const proof: ProofStruct = case01.proof as ProofStruct;

    await time.increaseTo(Number(invalidEvacuBlock.timestamp));
    await expect(
      diamondEvacuation.evacuate(lastExecutedBlock, invalidEvacuBlock, proof)
    ).to.be.revertedWithCustomError(
      diamondEvacuation,
      "InvalidEvacuatePubDataLength"
    );
  });

  it("Failed to evacuate, invalid commitment", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

    const lastExecutedBlock = latestStoredBlock;
    const evacuBlock = case01.newBlock;
    const invalidProof: ProofStruct = case01.proof as ProofStruct;
    invalidProof.commitment = [BigNumber.from("0x123456")];

    await time.increaseTo(Number(evacuBlock.timestamp));
    await expect(
      diamondEvacuation.evacuate(lastExecutedBlock, evacuBlock, invalidProof)
    ).to.be.revertedWithCustomError(
      diamondEvacuation,
      "CommitmentInconsistant"
    );
  });

  it("Failed to evacuate, invalid proof", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

    const lastExecutedBlock = latestStoredBlock;
    const evacuBlock = case01.newBlock;
    const invalidProof: ProofStruct = case01.proof as ProofStruct;
    invalidProof.a[0] = BigNumber.from("0x123456");

    await time.increaseTo(Number(evacuBlock.timestamp));
    await expect(
      diamondEvacuation.evacuate(lastExecutedBlock, evacuBlock, invalidProof)
    ).to.be.revertedWithCustomError(diamondEvacuation, "InvalidProof");
  });

  it("Failed to evacuate, the specified user and token is already evacuated", async function () {
    // expiration period = 14 days
    await time.increase(time.duration.days(14));
    await diamondEvacuation.activateEvacuation();

    const lastExecutedBlock = latestStoredBlock;
    const evacuBlock = case01.newBlock;
    const proof: ProofStruct = case01.proof as ProofStruct;

    await time.increaseTo(Number(evacuBlock.timestamp));
    await diamondEvacuation.evacuate(lastExecutedBlock, evacuBlock, proof);
    // evacuate again
    await expect(
      diamondEvacuation.evacuate(lastExecutedBlock, evacuBlock, proof)
    ).to.be.revertedWithCustomError(diamondEvacuation, "Evacuated");
  });
});

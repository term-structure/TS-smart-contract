import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { BaseTokenAddresses, RoundData } from "../../../utils/type";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { FACET_NAMES } from "../../../utils/config";
import { EMPTY_HASH, TS_BASE_TOKEN, TsTokenId } from "term-structure-sdk";
import {
  AccountFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  ZkTrueUp,
} from "../../../typechain-types";
import { StoredBlockStruct } from "../../../typechain-types/contracts/zkTrueUp/rollup/IRollupFacet";
import { updateRoundData } from "../../utils/updateRoundData";
import { rollupData } from "../../data/rollupData/rollBorrow/rollup";
import {
  BlockData,
  Users,
  handler,
  preprocessAndRollupBlocks,
  rollupOneBlock,
} from "../../utils/rollBorrowRollupHelper";
import { toL1Amt } from "../../utils/amountConvertor";
import { calcLoanId } from "../../utils/loanHelper";
import {
  resolveCancelRollBorrowPubData,
  resolveRollOverEndPubData,
} from "../../utils/publicDataHelper";

const initStateRoot = utils.hexZeroPad(
  utils.hexlify(BigInt(rollupData.initState.stateRoot)),
  32
);

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES, false, "RollBorrowVerifier", initStateRoot);
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

describe("Roll borrow", function () {
  let [user1, user2]: Signer[] = [];
  let accounts: Users;
  let storedBlocks: StoredBlockStruct[] = [];
  let zkTrueUp: ZkTrueUp;
  let admin: Signer;
  let operator: Signer;
  let diamondAcc: AccountFacet;
  let diamondRollup: RollupFacet;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let diamondLoan: LoanFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  const genesisBlock: StoredBlockStruct = {
    blockNumber: BigNumber.from("0"),
    stateRoot: initStateRoot,
    l1RequestNum: BigNumber.from("0"),
    pendingRollupTxHash: EMPTY_HASH,
    commitment: utils.defaultAbiCoder.encode(
      ["bytes32"],
      [String("0x").padEnd(66, "0")]
    ),
    timestamp: BigNumber.from("0"),
  };

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    accounts = new Users(await ethers.getSigners());
    rollupData.user_data.forEach((user) =>
      accounts.addUser(user.tsPubKeyX, user.tsPubKeyY)
    );
    zkTrueUp = res.zkTrueUp;
    admin = res.admin;
    operator = res.operator;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUpAddr)) as LoanFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    storedBlocks.push(genesisBlock);

    // activate the roll-borrow function
    await diamondLoan.connect(admin).setActivatedRoller(true);

    // mock token price
    const wbtcPriceFeed = res.priceFeeds[TsTokenId.WBTC];
    const wbtcRoundDataJSON: RoundData = {
      roundId: 1,
      answer: "3000000000000",
      startedAt: 0,
      updatedAt: 0,
      answeredInRound: 0,
    };
    await (await updateRoundData(
        operator,
        wbtcPriceFeed,
        wbtcRoundDataJSON
      )).answer;
    const usdcPriceFeed = res.priceFeeds[TsTokenId.USDC];
    const usdcRoundDataJSON: RoundData = {
      roundId: 1,
      answer: "100000000",
      startedAt: 0,
      updatedAt: 0,
      answeredInRound: 0,
    };
    await (await updateRoundData(
        operator,
        usdcPriceFeed,
        usdcRoundDataJSON
      )).answer;

    // test data `rollupData`
    // |-----------------------------------------------------------------------------------------------------------|
    // |           | block 1               | block 2               | block 3               | block 4               |
    // |-----------|-----------------------|-----------------------|-----------------------|-----------------------|
    // | Request 1 | Register              | AuctionLend           | AuctionStart          | AuctionLend           |
    // |- - - - - -|-----------------------|-----------------------|-----------------------|-----------------------|
    // | Request 2 | Deposit               | AuctionBorrow         | AuctionMatch          | RollBorrowOrder       |
    // |- - - - - -|-----------------------|-----------------------|-----------------------|-----------------------|
    // | Request 3 | Deposit               | Noop                  | AuctionEnd            | Noop                  |
    // |- - - - - -|-----------------------|-----------------------|-----------------------|-----------------------|
    // | Request 4 | CreateTsbToken        | Noop                  | CreateTsbToken        | Noop                  |
    // |-----------------------------------------------------------------------------------------------------------|
    // |                                                                                                           |
    // |-----------------------------------------------------------------------------------------------------------|
    // |           | block 5               | block 6               | block 7               | block 8               |
    // |-----------|-----------------------|-----------------------|-----------------------|-----------------------|
    // | Request 1 | UserCancelRollBorrow  | RollBorrowOrder       | RollBorrowOrder       | RollOverStart         |
    // |- - - - - -|-----------------------|-----------------------|-----------------------|-----------------------|
    // | Request 2 | Noop                  | AdminCancelRollBorrow | Noop                  | RollOverMatch         |
    // |- - - - - -|-----------------------|-----------------------|-----------------------|-----------------------|
    // | Request 3 | Noop                  | Noop                  | Noop                  | RollOverEnd           |
    // |- - - - - -|-----------------------|-----------------------|-----------------------|-----------------------|
    // | Request 4 | Noop                  | Noop                  | Noop                  | ForceCancelRollBorrow |
    // |-----------|-----------------------------------------------------------------------------------------------|
  });

  it("Success to rollup l2 user cancel roll borrow order", async function () {
    // |-----------------------------------|
    // |           | block 5               |
    // |-----------|-----------------------|
    // | Request 1 | UserCancelRollBorrow  |
    // |- - - - - -|-----------------------|
    // | Request 2 | Noop                  |
    // |- - - - - -|-----------------------|
    // | Request 3 | Noop                  |
    // |- - - - - -|-----------------------|
    // | Request 4 | Noop                  |
    // |-----------|-----------------------|

    // preprocess 4 blocks
    const NumOfPreProcessBlocks = 4;
    let latestStoredBlock = await preprocessAndRollupBlocks(
      NumOfPreProcessBlocks,
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

    // user cancel roll-borrow order in the 5th block
    const BLOCK_NUMBER = 5;
    const block = rollupData.blocks[BLOCK_NUMBER - 1];
    const userCancelRollBorrowPubData = block.pendingRollupTxPubData[0];
    const { accountId, debtTokenId, collateralTokenId, maturityTime } =
      resolveCancelRollBorrowPubData(userCancelRollBorrowPubData);

    const loanId = calcLoanId(
      Number(accountId),
      Number(maturityTime),
      Number(debtTokenId),
      Number(collateralTokenId)
    );

    const beforeLoan = await diamondLoan.getLoan(loanId);
    const beforeLockedCollateralAmt = beforeLoan.lockedCollateralAmt;
    // expect locked collateral amount is not zero
    expect(beforeLockedCollateralAmt).to.not.eq(0);

    const { executeBlockTx } = await rollupOneBlock(
      diamondRollup,
      operator,
      block as BlockData,
      latestStoredBlock
    );

    const afterLoan = await diamondLoan.getLoan(loanId);
    expect(afterLoan.lockedCollateralAmt).to.eq(0);

    // check event
    await expect(executeBlockTx)
      .to.emit(diamondRollup, "RollBorrowCancel")
      .withArgs(loanId, beforeLockedCollateralAmt);
  });

  it("Success to rollup l2 admin cancel roll borrow order", async function () {
    // |-----------------------------------|
    // |           | block 6               |
    // |-----------|-----------------------|
    // | Request 1 | RollBorrowOrder       |
    // |- - - - - -|-----------------------|
    // | Request 2 | AdminCancelRollBorrow |
    // |- - - - - -|-----------------------|
    // | Request 3 | Noop                  |
    // |- - - - - -|-----------------------|
    // | Request 4 | Noop                  |
    // |-----------------------------------|

    // preprocess 5 blocks
    const NumOfPreProcessBlocks = 5;
    let latestStoredBlock = await preprocessAndRollupBlocks(
      NumOfPreProcessBlocks,
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

    // user send roll-borrow order,
    // then admin cancel roll-borrow order in the 6th block
    const BLOCK_NUMBER = 6;
    const block = rollupData.blocks[BLOCK_NUMBER - 1];
    const rollBorrowOrderRequestIndex = 0;
    // do `RollBorrow` behavior in L1 first
    await handler(
      diamondTsb,
      diamondToken,
      diamondLoan,
      diamondAcc,
      operator,
      block.l1RequestPubData[rollBorrowOrderRequestIndex],
      block.l1RequestPubData[rollBorrowOrderRequestIndex + 1],
      accounts,
      baseTokenAddresses
    );

    const adminCancelRollBorrowRequestIndex = 0;
    const adminCancelRollBorrowPubData =
      block.pendingRollupTxPubData[adminCancelRollBorrowRequestIndex];
    const { accountId, debtTokenId, collateralTokenId, maturityTime } =
      resolveCancelRollBorrowPubData(adminCancelRollBorrowPubData);
    const loanId = calcLoanId(
      Number(accountId),
      Number(maturityTime),
      Number(debtTokenId),
      Number(collateralTokenId)
    );
    const beforeLoan = await diamondLoan.getLoan(loanId);
    const beforeLockedCollateralAmt = beforeLoan.lockedCollateralAmt;
    // expect locked collateral amount is not zero
    expect(beforeLockedCollateralAmt).to.not.eq(0);

    const { executeBlockTx } = await rollupOneBlock(
      diamondRollup,
      operator,
      block as BlockData,
      latestStoredBlock
    );

    const afterLoan = await diamondLoan.getLoan(loanId);
    expect(afterLoan.lockedCollateralAmt).to.eq(0);

    // check event
    await expect(executeBlockTx)
      .to.emit(diamondRollup, "RollBorrowCancel")
      .withArgs(loanId, beforeLockedCollateralAmt);
  });

  it("Success to rollup roll-over-end", async function () {
    // |-----------------------------------|
    // |           | block 8               |
    // |-----------|-----------------------|
    // | Request 1 | RollOverStart         |
    // |- - - - - -|-----------------------|
    // | Request 2 | RollOverMatch         |
    // |- - - - - -|-----------------------|
    // | Request 3 | RollOverEnd           |
    // |- - - - - -|-----------------------|
    // | Request 4 | ForceCancelRollBorrow |
    // |-----------------------------------|

    // preprocess 7 blocks
    const NumOfPreProcessBlocks = 7;
    let latestStoredBlock = await preprocessAndRollupBlocks(
      NumOfPreProcessBlocks,
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

    // roll-over-end in the 8th block
    const BLOCK_NUMBER = 8;
    const block = rollupData.blocks[BLOCK_NUMBER - 1];
    const rollOverEndPubData = block.pendingRollupTxPubData[0];
    const {
      accountId,
      collateralTokenId,
      collateralAmt,
      debtTokenId,
      oldMaturityTime,
      newMaturityTime,
      debtAmt,
      borrowAmt,
    } = resolveRollOverEndPubData(rollOverEndPubData);
    const l1CollateralAmt = toL1Amt(collateralAmt, TS_BASE_TOKEN.WBTC);
    const l1DebtAmt = toL1Amt(debtAmt, TS_BASE_TOKEN.USDC);
    const l1BorrowAmt = toL1Amt(borrowAmt, TS_BASE_TOKEN.USDC);

    const oldLoanId = calcLoanId(
      Number(accountId),
      Number(oldMaturityTime),
      Number(debtTokenId),
      Number(collateralTokenId)
    );
    const newLoanId = calcLoanId(
      Number(accountId),
      Number(newMaturityTime),
      Number(debtTokenId),
      Number(collateralTokenId)
    );
    // state before rollup roll over end
    const beforeOldLoan = await diamondLoan.getLoan(oldLoanId);
    const beforeNewLoan = await diamondLoan.getLoan(newLoanId);

    // do `ForceCancelRollBorrow` behavior in L1 first
    for (let i = 0; i < block.l1RequestPubData.length; i++) {
      await handler(
        diamondTsb,
        diamondToken,
        diamondLoan,
        diamondAcc,
        operator,
        block.l1RequestPubData[i],
        block.l1RequestPubData[i + 1],
        accounts,
        baseTokenAddresses
      );
    }

    const { executeBlockTx } = await rollupOneBlock(
      diamondRollup,
      operator,
      block as BlockData,
      latestStoredBlock
    );

    const afterOldLoan = await diamondLoan.getLoan(oldLoanId);
    const afterNewLoan = await diamondLoan.getLoan(newLoanId);

    // check state
    expect(beforeOldLoan.collateralAmt.sub(afterOldLoan.collateralAmt)).to.eq(
      l1CollateralAmt
    );
    expect(afterNewLoan.collateralAmt.sub(beforeNewLoan.collateralAmt)).to.eq(
      l1CollateralAmt
    );
    expect(afterNewLoan.debtAmt.sub(beforeNewLoan.debtAmt)).to.eq(l1DebtAmt);
    expect(beforeOldLoan.debtAmt.sub(afterOldLoan.debtAmt)).to.eq(l1BorrowAmt);

    // check event
    await expect(executeBlockTx)
      .to.emit(diamondRollup, "RollOver")
      .withArgs(oldLoanId, newLoanId, l1CollateralAmt, l1BorrowAmt, l1DebtAmt);
  });
  it("Success to force cancel roll-borrow order and rollup force cancel roll-borrow", async function () {
    // |-----------------------------------|
    // |           | block 8               |
    // |-----------|-----------------------|
    // | Request 1 | RollOverStart         |
    // |- - - - - -|-----------------------|
    // | Request 2 | RollOverMatch         |
    // |- - - - - -|-----------------------|
    // | Request 3 | RollOverEnd           |
    // |- - - - - -|-----------------------|
    // | Request 4 | ForceCancelRollBorrow |
    // |-----------------------------------|

    // preprocess 7 blocks
    const NumOfPreProcessBlocks = 7;
    let latestStoredBlock = await preprocessAndRollupBlocks(
      NumOfPreProcessBlocks,
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

    const BLOCK_NUMBER = 8; // force cancel roll-borrow in the 8th block
    const block = rollupData.blocks[BLOCK_NUMBER - 1];
    const cancelRollBorrowPubData = block.pendingRollupTxPubData[1];
    const { accountId, debtTokenId, collateralTokenId, maturityTime } =
      resolveCancelRollBorrowPubData(cancelRollBorrowPubData);

    const loanId = await diamondLoan.getLoanId(
      accountId,
      maturityTime,
      debtTokenId,
      collateralTokenId
    );

    const user = accounts.getUser(Number(accountId));
    const forceCancelRollBorrowTx = await diamondLoan
      .connect(user.signer)
      .forceCancelRollBorrow(loanId);

    // check event
    await expect(forceCancelRollBorrowTx)
      .to.emit(diamondLoan, "RollBorrowOrderForceCancelPlaced")
      .withArgs(await user.signer.getAddress(), loanId);

    await rollupOneBlock(
      diamondRollup,
      operator,
      block as BlockData,
      latestStoredBlock
    );

    const afterLoan = await diamondLoan.getLoan(loanId);

    // check state
    // expect locked collateral amount is zero after force cancel roll-borrow
    expect(afterLoan.lockedCollateralAmt).to.eq(0);
  });
  it("Fail to force cancel roll-borrow order, (not the loan owner)", async function () {
    // |-----------------------------------|
    // |           | block 8               |
    // |-----------|-----------------------|
    // | Request 1 | RollOverStart         |
    // |- - - - - -|-----------------------|
    // | Request 2 | RollOverMatch         |
    // |- - - - - -|-----------------------|
    // | Request 3 | RollOverEnd           |
    // |- - - - - -|-----------------------|
    // | Request 4 | ForceCancelRollBorrow |
    // |-----------------------------------|

    // preprocess 7 blocks
    const NumOfPreProcessBlocks = 7;
    await preprocessAndRollupBlocks(
      NumOfPreProcessBlocks,
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

    const BLOCK_NUMBER = 8; // force cancel roll-borrow in the 8th block
    const block = rollupData.blocks[BLOCK_NUMBER - 1];
    const cancelRollBorrowPubData = block.pendingRollupTxPubData[1];
    const { accountId, debtTokenId, collateralTokenId, maturityTime } =
      resolveCancelRollBorrowPubData(cancelRollBorrowPubData);

    const loanId = await diamondLoan.getLoanId(
      accountId,
      maturityTime,
      debtTokenId,
      collateralTokenId
    );

    const fakeUser = user2;
    await expect(
      diamondLoan.connect(fakeUser).forceCancelRollBorrow(loanId)
    ).to.be.revertedWithCustomError(diamondLoan, "isNotLoanOwner");
  });
  it("Success to set and get roll-over fee", async function () {
    const newRollOverFee = utils.parseEther("0.05");
    await expect(diamondLoan.connect(admin).setRollOverFee(newRollOverFee))
      .to.emit(diamondLoan, "SetRollOverFee")
      .withArgs(newRollOverFee);

    const rollOverFee = await diamondLoan.getRollOverFee();
    expect(rollOverFee).to.eq(newRollOverFee);
  });
});

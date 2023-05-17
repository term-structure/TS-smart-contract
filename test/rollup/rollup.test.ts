import { BigNumber, utils, Signer } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { resolve } from "path";
import {
  EMPTY_HASH,
  TS_BASE_TOKEN,
  TS_SYSTEM_DECIMALS,
  TsTxType,
} from "term-structure-sdk";
// import initStates from '../../data/rollupTestData/phase6-refactor-8-10-8-6-3-3-31/initStates.json';
import initStates from "../data/rollupData/zkTrueUp-8-10-8-6-3-3-31/initStates.json";
// import { deploy } from "../../utils/deploy";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  ProofStruct,
  StoredBlockStruct,
} from "../../typechain-types/contracts/rollup/IRollupFacet";
import {
  AccountFacet,
  GovernanceFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  ZkTrueUp,
} from "../../typechain-types";
import { LoanStruct } from "../../typechain-types/contracts/loan/ILoanFacet";
import {
  DEFAULT_ZERO_ADDR,
  ETH_ASSET_CONFIG,
  FACET_NAMES,
} from "../../utils/config";
import { useFacet } from "../../utils/useFacet";
import { deployAndInit } from "../utils/deployAndInit";
import { whiteListBaseTokens } from "../utils/whitelistToken";
import { BaseTokenAddresses } from "../../utils/type";
import { AssetConfigStruct } from "../../typechain-types/contracts/token/ITokenFacet";
import {
  getCommitBlock,
  getDecimals,
  getExecuteBlock,
  getPendingRollupTxPubData,
  getRollupTxPubData,
  getStoredBlock,
  initTestData,
  readAuctionEndPubData,
  readWithdrawFeePubData,
} from "../utils/rollupHelper";
// const testDataPath = resolve(
//   './test/data/rollupTestData/phase6-refactor-8-10-8-6-3-3-31',
// );
const testDataPath = resolve("./test/data/rollupData/zkTrueUp-8-10-8-6-3-3-31");

const testData = initTestData(testDataPath);

class AccountState {
  pendingBalances: { [key: number]: BigNumber };
  loans: { [key: string]: LoanStruct };
  withdrawFees: { [key: number]: BigNumber };
  constructor() {
    this.pendingBalances = {};
    this.loans = {};
    this.withdrawFees = {};
  }
}

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
  storedBlocks.push(genesisBlock);
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

async function getStates(
  accounts: Signer[],
  baseTokenAddresses: BaseTokenAddresses,
  diamondGov: GovernanceFacet,
  diamondLoan: LoanFacet,
  diamondToken: TokenFacet,
  diamondRollup: RollupFacet,
  diamondTsb: TsbFacet,
  testCase: any
) {
  class Collection {
    withdrawTokenIds: Set<number>;
    withdrawFeeTokenIds: Set<number>;
    loanIds: Set<string>;
    constructor() {
      this.withdrawTokenIds = new Set();
      this.withdrawFeeTokenIds = new Set();
      this.loanIds = new Set();
    }
  }

  const rollupTxPubData = getRollupTxPubData(testCase);
  const collections: { [key: number]: Collection } = {};
  for (let i = 0; i < testCase.requests.reqData.length; i++) {
    const reqType = testCase.requests.reqData[i][0];
    if (
      reqType == TsTxType.WITHDRAW.toString() ||
      reqType == TsTxType.FORCE_WITHDRAW.toString()
    ) {
      const accountId = Number(testCase.requests.reqData[i][1]);
      const tokenId = Number(testCase.requests.reqData[i][2]);
      if (!collections[accountId]) {
        collections[accountId] = new Collection();
      }
      collections[accountId].withdrawTokenIds.add(tokenId);
    } else if (reqType == TsTxType.AUCTION_END.toString()) {
      const loanPubData = readAuctionEndPubData(rollupTxPubData[i]);
      const accountId = loanPubData.accountId.toNumber();
      const tsbTokenConfig: AssetConfigStruct =
        await diamondToken.getAssetConfig(loanPubData.bondTokenId);
      const maturityTime = await diamondTsb.getMaturityTime(
        tsbTokenConfig.tokenAddr
      );
      const baseTokenAddr = await diamondTsb.getUnderlyingAsset(
        tsbTokenConfig.tokenAddr
      );
      const baseTokenId = await diamondToken.getTokenId(baseTokenAddr);
      const loanId = `${accountId}-${loanPubData.collateralTokenId}-${baseTokenId}-${maturityTime}`;
      if (!collections[accountId]) {
        collections[accountId] = new Collection();
      }
      collections[accountId].loanIds.add(loanId);
    } else if (reqType == TsTxType.WITHDRAW_FEE.toString()) {
      const withdrawFeePubData = readWithdrawFeePubData(rollupTxPubData[i]);
      const tokenId = withdrawFeePubData.tokenId.toNumber();
      const accountId = 0;
      if (!collections[accountId]) {
        collections[accountId] = new Collection();
      }
      collections[accountId].withdrawFeeTokenIds.add(tokenId);
    }
  }
  const states: { [key: number]: AccountState } = {};

  for (const accountId in collections) {
    const collection: Collection = collections[accountId];

    for (const tokenId of collection.withdrawTokenIds) {
      const tokenAddr = baseTokenAddresses[tokenId];
      const sender = accounts[accountId];
      const pendingBalance = await diamondRollup.getPendingBalances(
        await sender.getAddress(),
        tokenAddr
      );
      if (!states[accountId]) {
        states[accountId] = new AccountState();
      }
      states[accountId].pendingBalances[tokenId] = pendingBalance;
    }

    for (const tokenId of collection.withdrawFeeTokenIds) {
      const tokenAddr = baseTokenAddresses[tokenId];
      const token = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        tokenAddr
      );
      const treasuryAmt = await token.balanceOf(
        await diamondGov.getTreasuryAddr()
      );
      const vaultAmt = await token.balanceOf(await diamondGov.getVaultAddr());
      const insuranceAmt = await token.balanceOf(
        await diamondGov.getInsuranceAddr()
      );

      if (!states[accountId]) {
        states[accountId] = new AccountState();
      }
      states[accountId].withdrawFees[tokenId] = treasuryAmt
        .add(vaultAmt)
        .add(insuranceAmt);
    }

    for (const id of collection.loanIds) {
      const [accountId, collateralTokenId, baseTokenId, maturityTime] =
        id.split("-");
      const loanId = await diamondLoan.getLoanId(
        BigNumber.from(accountId),
        BigNumber.from(maturityTime),
        BigNumber.from(baseTokenId),
        BigNumber.from(collateralTokenId)
      );
      const loan = await diamondLoan.getLoan(loanId);
      if (!states[Number(accountId)]) {
        states[Number(accountId)] = new AccountState();
      }
      states[Number(accountId)].loans[loanId] = loan;
    }
  }
  return states;
}

async function checkStates(
  diamondToken: TokenFacet,
  diamondLoan: LoanFacet,
  diamondTsb: TsbFacet,
  testCase: any,
  oriStates: any,
  newStates: any
) {
  const rollupTxPubData = getRollupTxPubData(testCase);
  const deltaStates: { [key: number]: AccountState } = {};
  for (let i = 0; i < testCase.requests.reqData.length; i++) {
    const reqType = testCase.requests.reqData[i][0];
    if (reqType == TsTxType.WITHDRAW || reqType == TsTxType.FORCE_WITHDRAW) {
      const accountId = Number(testCase.requests.reqData[i][1]);
      const tokenId = Number(testCase.requests.reqData[i][2]);
      const tokenDecimals = getDecimals(tokenId);
      const amount = BigNumber.from(testCase.requests.reqData[i][3])
        .mul(BigNumber.from(10).pow(tokenDecimals))
        .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));
      if (!deltaStates[accountId]) {
        deltaStates[accountId] = new AccountState();
      }

      if (!deltaStates[accountId].pendingBalances[tokenId]) {
        deltaStates[accountId].pendingBalances[tokenId] = BigNumber.from("0");
      }
      deltaStates[accountId].pendingBalances[tokenId] =
        deltaStates[accountId].pendingBalances[tokenId].add(amount);
    } else if (reqType == TsTxType.AUCTION_END) {
      const loanPubData = readAuctionEndPubData(rollupTxPubData[i]);
      const accountId = loanPubData.accountId.toNumber();
      const tsbTokenConfig = await diamondToken.getAssetConfig(
        loanPubData.bondTokenId
      );
      const maturityTime = await diamondTsb.getMaturityTime(
        tsbTokenConfig.tokenAddr
      );
      const baseTokenAddr = await diamondTsb.getUnderlyingAsset(
        tsbTokenConfig.tokenAddr
      );
      const debtTokenId = await diamondToken.getTokenId(baseTokenAddr);
      const debtTokenConfig = await diamondToken.getAssetConfig(debtTokenId);
      const collateralTokenConfig = await diamondToken.getAssetConfig(
        loanPubData.collateralTokenId
      );

      const loanId = await diamondLoan.getLoanId(
        BigNumber.from(accountId),
        BigNumber.from(maturityTime),
        BigNumber.from(debtTokenId),
        BigNumber.from(loanPubData.collateralTokenId)
      );

      const debtAmt = BigNumber.from(loanPubData.debtAmt)
        .mul(BigNumber.from(10).pow(BigNumber.from(debtTokenConfig.decimals)))
        .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));
      const collateralAmt = BigNumber.from(loanPubData.collateralAmt)
        .mul(
          BigNumber.from(10).pow(BigNumber.from(collateralTokenConfig.decimals))
        )
        .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));
      const loan: LoanStruct = {
        accountId: accountId,
        maturityTime: maturityTime,
        collateralTokenId: loanPubData.collateralTokenId.toNumber(),
        debtTokenId: debtTokenId,
        debtAmt: debtAmt,
        collateralAmt: collateralAmt,
      };

      if (!deltaStates[accountId]) {
        deltaStates[accountId] = new AccountState();
      }
      if (!deltaStates[accountId].loans[loanId]) {
        deltaStates[accountId].loans[loanId] = loan;
      } else {
        const oriLoan = deltaStates[accountId].loans[loanId];
        deltaStates[accountId].loans[loanId].collateralAmt = BigNumber.from(
          oriLoan.collateralAmt
        ).add(BigNumber.from(loan.collateralAmt));
        deltaStates[accountId].loans[loanId].debtAmt = BigNumber.from(
          oriLoan.debtAmt
        ).add(BigNumber.from(loan.debtAmt));
      }
    } else if (reqType == TsTxType.WITHDRAW_FEE) {
      const withdrawFeePubData = readWithdrawFeePubData(rollupTxPubData[i]);
      const accountId = 0;
      const tokenId = withdrawFeePubData.tokenId.toNumber();
      const tokenConfig = await diamondToken.getAssetConfig(tokenId);
      const amount = BigNumber.from(withdrawFeePubData.amount)
        .mul(BigNumber.from(10).pow(tokenConfig.decimals))
        .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));
      if (!deltaStates[accountId]) {
        deltaStates[accountId] = new AccountState();
      }
      if (!deltaStates[accountId].withdrawFees[tokenId]) {
        deltaStates[accountId].withdrawFees[tokenId] = BigNumber.from("0");
      }
      const oriAmt = deltaStates[accountId].withdrawFees[tokenId];
      deltaStates[accountId].withdrawFees[tokenId] = oriAmt.add(amount);
    }
  }
  for (const accountId in deltaStates) {
    for (const tokenId in deltaStates[accountId].pendingBalances) {
      const amount = deltaStates[accountId].pendingBalances[tokenId];

      expect(
        newStates[accountId].pendingBalances[tokenId].sub(
          oriStates[accountId].pendingBalances[tokenId]
        )
      ).to.be.eq(amount);
    }
    for (const tokenId in deltaStates[accountId].withdrawFees) {
      const amount = deltaStates[accountId].withdrawFees[tokenId];
      expect(
        newStates[accountId].withdrawFees[tokenId].sub(
          oriStates[accountId].withdrawFees[tokenId]
        )
      ).to.be.eq(amount);
    }
    for (const loanId in deltaStates[accountId].loans) {
      const loan = deltaStates[accountId].loans[loanId];
      expect(
        newStates[accountId].loans[loanId].collateralAmt.sub(
          oriStates[accountId].loans[loanId].collateralAmt
        )
      ).to.be.eq(loan.collateralAmt);
      expect(
        newStates[accountId].loans[loanId].debtAmt.sub(
          oriStates[accountId].loans[loanId].debtAmt
        )
      ).to.be.eq(loan.debtAmt);
    }
  }
}

async function doRegister(
  accounts: Signer[],
  baseTokenAddresses: BaseTokenAddresses,
  diamondAcc: AccountFacet,
  testCase: any,
  requestId: number
) {
  const accountId = Number(testCase.requests.reqData[requestId][7]);
  const signer = accounts[accountId];
  const [tsPubKeyX, tsPubKeyY] = testCase.requests.tsPubKey[requestId];
  const tokenId = Number(testCase.requests.reqData[requestId + 1][2]);
  const tokenAddr = baseTokenAddresses[tokenId];
  const tokenDecimals = getDecimals(tokenId);

  const amount = BigNumber.from(testCase.requests.reqData[requestId + 1][3])
    .mul(BigNumber.from(10).pow(tokenDecimals))
    .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));
  if (tokenId.toString() == TS_BASE_TOKEN.ETH.tokenId.toString()) {
    const tokenAddr = ETH_ASSET_CONFIG.tokenAddr;
    await diamondAcc
      .connect(signer)
      .register(
        BigNumber.from(tsPubKeyX),
        BigNumber.from(tsPubKeyY),
        tokenAddr,
        BigNumber.from(amount),
        { value: amount }
      );
  } else {
    const token = await ethers.getContractAt("ERC20Mock", tokenAddr);
    await token.connect(signer).mint(await signer.getAddress(), amount);
    await token.connect(signer).approve(diamondAcc.address, amount);
    await diamondAcc
      .connect(signer)
      .register(
        BigNumber.from(tsPubKeyX),
        BigNumber.from(tsPubKeyY),
        token.address,
        BigNumber.from(amount)
      );
  }
}
async function doDeposit(
  accounts: Signer[],
  baseTokenAddresses: BaseTokenAddresses,
  diamondAcc: AccountFacet,
  testCase: any,
  requestId: number
) {
  const accountId = Number(testCase.requests.reqData[requestId][7]);
  const signer = accounts[accountId];
  const tokenId = Number(testCase.requests.reqData[requestId][2]);
  const tokenAddr = baseTokenAddresses[tokenId];
  const tokenDecimals = getDecimals(tokenId);

  const amount = BigNumber.from(testCase.requests.reqData[requestId][3])
    .mul(BigNumber.from(10).pow(tokenDecimals))
    .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));
  if (tokenId.toString() == TS_BASE_TOKEN.ETH.tokenId.toString()) {
    const tokenAddr = ETH_ASSET_CONFIG.tokenAddr;
    await diamondAcc
      .connect(signer)
      .deposit(await signer.getAddress(), tokenAddr, amount, { value: amount });
  } else {
    const token = await ethers.getContractAt("ERC20Mock", tokenAddr);
    await token.connect(signer).mint(await signer.getAddress(), amount);
    await token.connect(signer).approve(diamondAcc.address, amount);
    await diamondAcc
      .connect(signer)
      .deposit(signer.getAddress(), token.address, BigNumber.from(amount));
  }
}
async function doForceWithdraw(
  accounts: Signer[],
  baseTokenAddresses: BaseTokenAddresses,
  diamondAcc: AccountFacet,
  testCase: any,
  requestId: number
) {
  const accountId = Number(testCase.requests.reqData[requestId][7]);
  const signer = accounts[accountId];
  const tokenId = Number(testCase.requests.reqData[requestId][2]);
  const tokenAddr = baseTokenAddresses[tokenId];

  await diamondAcc.connect(signer).forceWithdraw(tokenAddr);
}
async function doCreateBondToken(
  operator: Signer,
  diamondToken: TokenFacet,
  diamondTsb: TsbFacet,
  testCase: any,
  requestId: number
) {
  const baseTokenId = BigNumber.from(
    testCase.requests.reqData[requestId][2]
  ).sub(5);
  const maturityTime = BigNumber.from(testCase.requests.reqData[requestId][8]);
  const name = "TslToken";
  const symbol = "TSL";

  await diamondTsb
    .connect(operator)
    .createTsbToken(baseTokenId, maturityTime, name, symbol);
  const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
    baseTokenId,
    maturityTime
  );

  const assetConfig: AssetConfigStruct = {
    isStableCoin: baseTokenId <= BigNumber.from("2") ? false : true,
    isTsbToken: true,
    decimals: TS_SYSTEM_DECIMALS,
    minDepositAmt: "0",
    tokenAddr: tsbTokenAddr,
    priceFeed: DEFAULT_ZERO_ADDR,
  };
  await diamondToken.connect(operator).addToken(assetConfig);
  const tokenId = await diamondToken.getTokenId(tsbTokenAddr);

  expect(tokenId).to.be.eq(
    BigNumber.from(testCase.requests.reqData[requestId][2])
  );
}

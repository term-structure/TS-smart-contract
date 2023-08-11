import { BigNumber, BytesLike, Signer, utils } from "ethers";
import { expect } from "chai";
import fs from "fs";
import { resolve } from "path";
import {
  AUCTION_END_BYTES,
  BYTES_OF_CHUNK,
  DEFAULT_ZERO_ADDR,
  ETH_ASSET_CONFIG,
  FORCE_WITHDRAW_BYTES,
  NOOP_BYTES,
  WITHDRAW_BYTES,
  WITHDRAW_FEE_BYTES,
} from "../../utils/config";
import {
  CHUNK_BYTES_SIZE,
  EMPTY_HASH,
  TS_BASE_TOKEN,
  TS_SYSTEM_DECIMALS,
  TsTxType,
  uint8ArrayToHexString,
} from "term-structure-sdk";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  ProofStruct,
  StoredBlockStruct,
} from "../../typechain-types/contracts/zkTrueUp/rollup/IRollupFacet";
import {
  AccountState,
  BaseTokenAddresses,
  LoanPubData,
} from "../../utils/type";
import {
  AccountFacet,
  ProtocolParamsFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
} from "../../typechain-types";
import { AssetConfigStruct } from "../../typechain-types/contracts/zkTrueUp/token/ITokenFacet";
import { ethers } from "hardhat";
import { LoanStruct } from "../../typechain-types/contracts/zkTrueUp/loan/ILoanFacet";

export type RootInfo = {
  txId: string;
  accountTreeRoot: string;
  orderTreeRoot: string;
  bondTreeRoot: string;
  feeTreeRoot: string;
  nullifierOneRoot: string;
  nullifierTwoRoot: string;
  tsAdminAddr: string;
  nullifierTreeRoot: string;
  tsRoot: string; // hex
  stateRoot: string; // hex
};

type CommitBlockType = {
  oriFlowInfo: RootInfo;
  newFlowInfo: RootInfo;
  isCriticalChunk: string; // HexString
  o_chunk: string; // HexString
  timestamp: string; // decimalString
  publicData: string;
  chunkIdDeltas: number[];
  commitment: string;
  l1RequestNum: string;
  pendingRollupTxHash: string;
  commitmentForCircuit: string;
};

interface TestDataItem {
  index: string;
  path: string;
  commitBlock: CommitBlockType;
  callData: ProofStruct;
  reqDataList: Array<string[]>;
  tsPubKeyList: Array<[string, string]>;
}

export function initTestData(baseDir: string): TestDataItem[] {
  const result = [];
  const files = fs.readdirSync(baseDir, {
    withFileTypes: true,
  });
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (file.isFile() && file.name.endsWith(".commitBlock.json")) {
      const index = file.name.split(".")[0];
      const name = file.name.replace(".commitBlock.json", "");
      const commitBlockPath = resolve(baseDir, file.name);
      const calldataRawPath = resolve(baseDir, `${name}.calldata-raw.json`);
      const inputKeyPath = resolve(baseDir, `${name}.inputs-key.json`);
      const inputKeyData = JSON.parse(fs.readFileSync(inputKeyPath, "utf-8"));
      const inputPath = resolve(baseDir, `${name}.inputs.json`);
      const commitBlock = JSON.parse(fs.readFileSync(commitBlockPath, "utf-8"));
      const callDataRaw: [
        [string, string],
        [[string, string], [string, string]],
        [string, string],
        [string]
      ] = JSON.parse(fs.readFileSync(calldataRawPath, "utf-8"));
      const inputData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
      const reqDataList = inputKeyData.preprocessedReq.map((v: any) => v.req);
      if (reqDataList.find((v: any) => !v)) {
        throw new Error("invalid reqData");
      }
      const tsPubKeyList = inputKeyData.preprocessedReq.map(
        (v: any) => v.sig[0]
      );
      if (tsPubKeyList.find((v: any) => !v)) {
        throw new Error("invalid tsPubKeyList");
      }
      result.push({
        index: index,
        path: resolve(baseDir, file.name),
        commitBlock,
        callData: {
          a: callDataRaw[0],
          b: callDataRaw[1],
          c: callDataRaw[2],
          commitment: callDataRaw[3],
        },
        reqDataList,
        tsPubKeyList,
      } as TestDataItem);
    }
  }
  return result.sort((a, b) => parseInt(a.index) - parseInt(b.index));
}

export function initEvacuationTestData(baseDir: string) {
  const result = [];
  const files = fs.readdirSync(baseDir, {
    withFileTypes: true,
  });
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (file.isFile() && file.name.endsWith("-commitment.json")) {
      const index = file.name.split("_")[0];
      const name = file.name.replace("-commitment.json", "");
      const commitmentPath = resolve(baseDir, file.name);
      const calldataRawPath = resolve(baseDir, `${name}-calldata-raw.json`);
      const commitmentData = JSON.parse(
        fs.readFileSync(commitmentPath, "utf-8")
      );
      const callDataRaw = JSON.parse(fs.readFileSync(calldataRawPath, "utf-8"));

      result.push({
        index: index,
        path: resolve(baseDir, file.name),
        commitmentData,
        callData: {
          a: callDataRaw[0],
          b: callDataRaw[1],
          c: callDataRaw[2],
          commitment: callDataRaw[3],
        },
      });
    }
  }
  return result.sort((a, b) => parseInt(a.index) - parseInt(b.index));
}

export const getStates = async (
  accounts: Signer[],
  baseTokenAddresses: BaseTokenAddresses,
  diamondProtocolParams: ProtocolParamsFacet,
  diamondLoan: LoanFacet,
  diamondToken: TokenFacet,
  diamondRollup: RollupFacet,
  diamondTsb: TsbFacet,
  testCase: TestDataItem
) => {
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
  for (let i = 0; i < testCase.reqDataList.length; i++) {
    const reqType = testCase.reqDataList[i][0];
    if (
      reqType == TsTxType.WITHDRAW.toString() ||
      reqType == TsTxType.FORCE_WITHDRAW.toString()
    ) {
      const accountId = Number(testCase.reqDataList[i][1]);
      const tokenId = Number(testCase.reqDataList[i][2]);
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
        tsbTokenConfig.token
      );
      const baseTokenAddr = await diamondTsb.getUnderlyingAsset(
        tsbTokenConfig.token
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
        await diamondProtocolParams.getTreasuryAddr()
      );
      const vaultAmt = await token.balanceOf(
        await diamondProtocolParams.getVaultAddr()
      );
      const insuranceAmt = await token.balanceOf(
        await diamondProtocolParams.getInsuranceAddr()
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
};

export const checkStates = async (
  diamondToken: TokenFacet,
  diamondLoan: LoanFacet,
  diamondTsb: TsbFacet,
  testCase: TestDataItem,
  oriStates: any,
  newStates: any
) => {
  const rollupTxPubData = getRollupTxPubData(testCase);
  const deltaStates: { [key: number]: AccountState } = {};
  for (let i = 0; i < testCase.reqDataList.length; i++) {
    const reqType = testCase.reqDataList[i][0];
    if (reqType == TsTxType.WITHDRAW || reqType == TsTxType.FORCE_WITHDRAW) {
      const accountId = Number(testCase.reqDataList[i][1]);
      const tokenId = Number(testCase.reqDataList[i][2]);
      const tokenDecimals = getDecimals(tokenId);
      const amount = BigNumber.from(testCase.reqDataList[i][3])
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
        tsbTokenConfig.token
      );
      const baseTokenAddr = await diamondTsb.getUnderlyingAsset(
        tsbTokenConfig.token
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
};

export const doRegister = async (
  accounts: Signer[],
  baseTokenAddresses: BaseTokenAddresses,
  diamondAcc: AccountFacet,
  testCase: TestDataItem,
  requestId: number
) => {
  const accountId = Number(testCase.reqDataList[requestId][7]);
  const signer = accounts[accountId];
  const signerAddr = await signer.getAddress();
  const [tsPubKeyX, tsPubKeyY] = testCase.tsPubKeyList[requestId];
  const tokenId = Number(testCase.reqDataList[requestId + 1][2]);
  const tokenAddr = baseTokenAddresses[tokenId];
  const tokenDecimals = getDecimals(tokenId);

  const amount = BigNumber.from(testCase.reqDataList[requestId + 1][3])
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
    await token.connect(signer).mint(signerAddr, amount);
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
};
export const doDeposit = async (
  accounts: Signer[],
  baseTokenAddresses: BaseTokenAddresses,
  diamondAcc: AccountFacet,
  testCase: TestDataItem,
  requestId: number
) => {
  const accountId = Number(testCase.reqDataList[requestId][7]);
  const signer = accounts[accountId];
  const signerAddr = await signer.getAddress();
  const tokenId = Number(testCase.reqDataList[requestId][2]);
  const tokenAddr = baseTokenAddresses[tokenId];
  const tokenDecimals = getDecimals(tokenId);

  const amount = BigNumber.from(testCase.reqDataList[requestId][3])
    .mul(BigNumber.from(10).pow(tokenDecimals))
    .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));
  if (tokenId.toString() == TS_BASE_TOKEN.ETH.tokenId.toString()) {
    const tokenAddr = ETH_ASSET_CONFIG.tokenAddr;
    await diamondAcc
      .connect(signer)
      .deposit(signerAddr, tokenAddr, amount, { value: amount });
  } else {
    const token = await ethers.getContractAt("ERC20Mock", tokenAddr);
    await token.connect(signer).mint(signerAddr, amount);
    await token.connect(signer).approve(diamondAcc.address, amount);
    await diamondAcc.connect(signer).deposit(signerAddr, token.address, amount);
  }
};
export const doForceWithdraw = async (
  accounts: Signer[],
  baseTokenAddresses: BaseTokenAddresses,
  diamondAcc: AccountFacet,
  testCase: TestDataItem,
  requestId: number
) => {
  const accountId = Number(testCase.reqDataList[requestId][7]);
  const signer = accounts[accountId];
  const tokenId = Number(testCase.reqDataList[requestId][2]);
  const tokenAddr = baseTokenAddresses[tokenId];

  await diamondAcc.connect(signer).forceWithdraw(tokenAddr);
};
export const doCreateBondToken = async (
  operator: Signer,
  diamondToken: TokenFacet,
  diamondTsb: TsbFacet,
  testCase: TestDataItem,
  requestId: number
) => {
  const baseTokenId = BigNumber.from(testCase.reqDataList[requestId][2]).sub(5);
  const maturityTime = BigNumber.from(testCase.reqDataList[requestId][8]);
  const name = "TslToken";
  const symbol = "TSL";

  await diamondTsb
    .connect(operator)
    .createTsbToken(baseTokenId, maturityTime, name, symbol);
  const tsbTokenAddr = await diamondTsb.getTsbToken(baseTokenId, maturityTime);

  const assetConfig: AssetConfigStruct = {
    isStableCoin: baseTokenId <= BigNumber.from("2") ? false : true,
    isTsbToken: true,
    decimals: TS_SYSTEM_DECIMALS,
    minDepositAmt: "0",
    token: tsbTokenAddr,
    priceFeed: DEFAULT_ZERO_ADDR,
  };
  await diamondToken.connect(operator).addToken(assetConfig);
  const tokenId = await diamondToken.getTokenId(tsbTokenAddr);

  expect(tokenId).to.be.eq(BigNumber.from(testCase.reqDataList[requestId][2]));
};

export function getPendingRollupTxHash(commitBlock: CommitBlockType) {
  let pendingRollupTxHash = EMPTY_HASH;
  const chunkLen = (commitBlock.o_chunk.length - 2) / 2 / CHUNK_BYTES_SIZE;
  const criticalChunks = getCriticalChunks(
    commitBlock.isCriticalChunk,
    chunkLen
  );
  for (let i = 0; i < criticalChunks.length; i++) {
    const startFlag = 2 + 2 * BYTES_OF_CHUNK * criticalChunks[i];
    const opType = Number(
      "0x" + commitBlock.o_chunk.slice(startFlag, startFlag + 2 * NOOP_BYTES)
    ).toString() as TsTxType;
    switch (opType) {
      case TsTxType.FORCE_WITHDRAW: {
        const pubdata =
          "0x" +
          commitBlock.o_chunk.slice(
            startFlag,
            startFlag + 2 * FORCE_WITHDRAW_BYTES
          );
        pendingRollupTxHash = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "bytes"],
            [pendingRollupTxHash, pubdata]
          )
        );
        break;
      }

      case TsTxType.WITHDRAW: {
        const pubdata =
          "0x" +
          commitBlock.o_chunk.slice(startFlag, startFlag + 2 * WITHDRAW_BYTES);
        pendingRollupTxHash = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "bytes"],
            [pendingRollupTxHash, pubdata]
          )
        );
        break;
      }
      case TsTxType.AUCTION_END: {
        const pubdata =
          "0x" +
          commitBlock.o_chunk.slice(
            startFlag,
            startFlag + 2 * AUCTION_END_BYTES
          );
        pendingRollupTxHash = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "bytes"],
            [pendingRollupTxHash, pubdata]
          )
        );
        break;
      }
      case TsTxType.WITHDRAW_FEE: {
        const pubdata =
          "0x" +
          commitBlock.o_chunk.slice(
            startFlag,
            startFlag + 2 * WITHDRAW_FEE_BYTES
          );
        pendingRollupTxHash = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["bytes32", "bytes"],
            [pendingRollupTxHash, pubdata]
          )
        );
        break;
      }
    }
  }
  return pendingRollupTxHash;
}

export const getDecimals = (tokenId: number) => {
  let tokenDecimals;
  Object.values(TS_BASE_TOKEN).forEach((token) => {
    if (tokenId.toString() == token.tokenId.toString()) {
      tokenDecimals = token.decimals;
    }
  });
  if (!tokenDecimals) {
    throw new Error("invalid tokenId");
  }
  return tokenDecimals;
};

export const readAuctionEndPubData = (pubData: string) => {
  const pubDataBytes = utils.arrayify(pubData);
  const loanPubData: LoanPubData = {
    accountId: BigNumber.from(pubDataBytes.slice(1, 5)),
    collateralTokenId: BigNumber.from(pubDataBytes.slice(5, 7)),
    collateralAmt: BigNumber.from(pubDataBytes.slice(7, 23)),
    bondTokenId: BigNumber.from(pubDataBytes.slice(23, 25)),
    debtAmt: BigNumber.from(pubDataBytes.slice(25, 41)),
  };
  return loanPubData;
};

export const readWithdrawFeePubData = (pubData: string) => {
  const pubDataBytes = utils.arrayify(pubData);
  const withdrawFeePubData = {
    tokenId: BigNumber.from(pubDataBytes.slice(1, 3)),
    amount: BigNumber.from(pubDataBytes.slice(3, 19)),
  };
  return withdrawFeePubData;
};

export const readEvacuationPubData = (pubData: string) => {
  const pubDataBytes = utils.arrayify(pubData);
  const evacuationPubData = {
    accountId: BigNumber.from(pubDataBytes.slice(1, 5)),
    tokenId: BigNumber.from(pubDataBytes.slice(5, 7)),
    amount: BigNumber.from(pubDataBytes.slice(7, 23)),
  };
  return evacuationPubData;
};

export function getRollupTxPubData(testCase: TestDataItem) {
  const oChunk = testCase.commitBlock.o_chunk;
  const bytesOfReq = [
    0 /* Unknown */, 3 /* Register */, 2 /* deposit */, 2 /* forcedWithdraw */,
    2 /* transfer */, 2 /* withdraw */, 3 /* auctionLend */,
    3 /* auctionBorrow */, 1 /* auctionStart */, 1 /* auctionMatch */,
    4 /* auctionEnd */, 3 /* secondLimitOrder */, 1 /* secondLimitStart */,
    1 /* secondLimitExchange */, 1 /* secondLimitEnd */,
    2 /* secondMarketOrder */, 1 /* secondMarketExchange */,
    1 /* secondMarketEnd */, 1 /* adminCancel */, 1 /* userCancel */,
    1 /* setEpoch */, 1 /* createBondToken */, 2 /* redeem */,
    2 /* withdrawFee */, 2 /* evacuation */, 1 /* setAdminTsAddr */,
  ];

  const rollupTxPubData = [];
  let offset = 2;
  let pubData;
  for (let i = 0; i < testCase.reqDataList.length; i++) {
    const opType = Number(testCase.reqDataList[i][0]);
    pubData =
      "0x" +
      oChunk.slice(offset, offset + 2 * bytesOfReq[opType] * BYTES_OF_CHUNK);
    offset += 2 * bytesOfReq[opType] * BYTES_OF_CHUNK;
    rollupTxPubData.push(pubData);
  }
  return rollupTxPubData;
}

export function getPendingRollupTxPubData(testCase: TestDataItem) {
  const pendingRollupTxPubdata = [];
  const chunkLen =
    (testCase.commitBlock.o_chunk.length - 2) / 2 / BYTES_OF_CHUNK;
  const criticalChunks = getCriticalChunks(
    testCase.commitBlock.isCriticalChunk,
    chunkLen
  );
  for (let i = 0; i < criticalChunks.length; i++) {
    const opType = Number(
      "0x" +
        testCase.commitBlock.o_chunk.slice(
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i],
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i] + 2
        )
    );
    let pubdata;
    if (opType == Number(TsTxType.FORCE_WITHDRAW)) {
      pubdata =
        "0x" +
        testCase.commitBlock.o_chunk.slice(
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i],
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i] + 2 * FORCE_WITHDRAW_BYTES
        );
      pendingRollupTxPubdata.push(pubdata);
    } else if (opType == Number(TsTxType.WITHDRAW)) {
      pubdata =
        "0x" +
        testCase.commitBlock.o_chunk.slice(
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i],
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i] + 2 * WITHDRAW_BYTES
        );
      pendingRollupTxPubdata.push(pubdata);
    } else if (opType == Number(TsTxType.AUCTION_END)) {
      pubdata =
        "0x" +
        testCase.commitBlock.o_chunk.slice(
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i],
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i] + 2 * AUCTION_END_BYTES
        );
      pendingRollupTxPubdata.push(pubdata);
    } else if (opType == Number(TsTxType.WITHDRAW_FEE)) {
      pubdata =
        "0x" +
        testCase.commitBlock.o_chunk.slice(
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i],
          2 + 2 * BYTES_OF_CHUNK * criticalChunks[i] + 2 * WITHDRAW_FEE_BYTES
        );
      pendingRollupTxPubdata.push(pubdata);
    }
  }

  return pendingRollupTxPubdata;
}

export function getCommitBlock(
  lastCommittedBlock: StoredBlockStruct,
  testCase: TestDataItem,
  isEvacuate: boolean
) {
  // const chunkLen =
  //   (testCase.commitBlock.o_chunk.length - 2) / 2 / CHUNK_BYTES_SIZE;
  let chunkLen;
  if (isEvacuate) {
    // NOTE: evacuate chunk is 2 chunks for 2 bits and padding it to 1 bytes(8 bits)
    chunkLen = 8;
  } else {
    // NOTE: normal chunk is 1 chunk for 1 bit and padding it to 1 bytes(8 bits)
    chunkLen = (testCase.commitBlock.o_chunk.length - 2) / 2 / CHUNK_BYTES_SIZE;
  }
  const chunkIdDeltas = getPubDataDeltas(
    testCase.commitBlock.isCriticalChunk,
    chunkLen
  );
  const commitBlock: CommitBlockStruct = {
    blockNumber: BigNumber.from(lastCommittedBlock.blockNumber).add(1),
    newStateRoot: testCase.commitBlock.newFlowInfo.stateRoot,
    newTsRoot: testCase.commitBlock.newFlowInfo.tsRoot,
    publicData: testCase.commitBlock.o_chunk,
    chunkIdDeltas,
    timestamp: testCase.commitBlock.timestamp,
  };
  return commitBlock;
}

export function getPubDataDeltas(isCriticalChunk: string, chunkLen: number) {
  const pubDataDeltas = [];
  let lastChunkId = 0;
  const arr = isCriticalChunk.replace("0x", "").split("");
  let cur = arr.splice(0, 2);
  let byteCount = 0;
  while (cur.length > 0) {
    const num = Number("0x" + cur.join(""));
    for (let index = 0; index < 8; index++) {
      const bits = 2 ** index;
      if (num & bits) {
        const currentBitIndex = byteCount * 8 + index;
        pubDataDeltas.push(currentBitIndex - lastChunkId);
        lastChunkId = currentBitIndex;
      }
    }
    cur = arr.splice(0, 2);
    byteCount += 1;
  }
  return pubDataDeltas;
}

export function getStoredBlock(
  commitBlock: CommitBlockStruct,
  testCase: TestDataItem
) {
  const publicData = utils.solidityPack(
    ["bytes", "bytes"],
    [testCase.commitBlock.isCriticalChunk, testCase.commitBlock.o_chunk]
  );
  const publicDataLength = (testCase.commitBlock.o_chunk.length - 2) / 2;
  const BITS_OF_BYTE = 8;
  const BYTES_OF_CHUNK = 12;
  const BITS_OF_CHUNK = BYTES_OF_CHUNK * BITS_OF_BYTE;
  const LAST_INDEX_OF_BYTE = BITS_OF_BYTE - 1;
  const commitmentOffset: Uint8Array = new Uint8Array(
    publicDataLength / BITS_OF_CHUNK
  );
  const chunkIdDeltas: number[] = commitBlock.chunkIdDeltas.map((v) =>
    Number(v)
  ); // Initialize with actual values if any.
  let chunkId = 0;
  for (let i = 0; i < chunkIdDeltas.length; i++) {
    chunkId += chunkIdDeltas[i];
    const chunkIndex: number = Math.floor(chunkId / BITS_OF_BYTE);
    const processingCommitmentOffset: number = commitmentOffset[chunkIndex];
    const bitwiseMask: number =
      1 << (LAST_INDEX_OF_BYTE - (chunkId % BITS_OF_BYTE));
    if ((processingCommitmentOffset & bitwiseMask) !== 0) {
      throw new Error(`OffsetIsSet: ${chunkId}`);
    }
    commitmentOffset[chunkIndex] = processingCommitmentOffset | bitwiseMask;
  }

  const commitmentHash = stateToCommitmentHash({
    oriStateRoot: testCase.commitBlock.oriFlowInfo.stateRoot,
    newStateRoot: testCase.commitBlock.newFlowInfo.stateRoot,
    newTsRoot: testCase.commitBlock.newFlowInfo.tsRoot,
    pubdata: testCase.commitBlock.publicData,
    commitmentOffset: utils.hexlify(commitmentOffset),
    newBlockTimestamp: testCase.commitBlock.timestamp,
  });
  const l1RequestNum = getL1RequestNum(testCase.reqDataList);
  const pendingRollupTxHash = getPendingRollupTxHash(testCase.commitBlock);
  const storedBlock: StoredBlockStruct = {
    blockNumber: commitBlock.blockNumber,
    l1RequestNum: l1RequestNum,
    pendingRollupTxHash: pendingRollupTxHash,
    commitment: commitmentHash,
    stateRoot: testCase.commitBlock.newFlowInfo.stateRoot,
    timestamp: commitBlock.timestamp,
  };
  return storedBlock;
}

export function getExecuteBlock(
  storedBlock: StoredBlockStruct,
  pendingRollupTxPubData: string[]
) {
  const executeBlock: ExecuteBlockStruct = {
    storedBlock: storedBlock,
    pendingRollupTxPubData: pendingRollupTxPubData,
  };
  return executeBlock;
}

export function getCriticalChunks(isCriticalChunk: string, chunkLen: number) {
  const criticalChunks = [];
  const binArr = BigInt(isCriticalChunk as string)
    .toString(2)
    .padStart(chunkLen, "0")
    .split("");
  for (let i = 0; i < binArr.length; i++) {
    if (binArr[i] == "1") {
      criticalChunks.push(i);
    }
  }
  return criticalChunks;
}

export function getPubDataOffset(isCriticalChunk: BytesLike) {
  const pubDataOffset = [];
  for (let i = 0; i < isCriticalChunk.length; i++) {
    if (isCriticalChunk[i] == "1") {
      pubDataOffset.push((Math.floor(i / 2) - 1) * BYTES_OF_CHUNK);
    }
  }
  return pubDataOffset;
}

export function stateToCommitmentHash({
  oriStateRoot,
  newStateRoot,
  newTsRoot,
  pubdata,
  commitmentOffset,
  newBlockTimestamp,
}: {
  oriStateRoot: string;
  newStateRoot: string;
  newTsRoot: string;
  pubdata: string;
  commitmentOffset: string;
  newBlockTimestamp: string;
}) {
  // console.log({
  //   oriStateRoot,
  //   newStateRoot,
  //   newTsRoot,
  //   newBlockTimestamp,
  //   commitmentOffset,
  //   pubdata,
  // })
  const commitmentMsg = utils.solidityPack(
    ["bytes32", "bytes32", "bytes32", "uint256", "bytes", "bytes"],
    [
      oriStateRoot,
      newStateRoot,
      newTsRoot,
      newBlockTimestamp,
      commitmentOffset,
      pubdata,
    ]
  );
  const commitmentHash = utils.sha256(commitmentMsg);

  // const commitment = toHex(
  //   BigInt(
  //     '0b' + BigInt(commitmentHash).toString(2).padStart(256, '0').slice(3),
  //   ),
  // );

  return commitmentHash;
}

export function getL1RequestNum(reqData: any) {
  let requestNum = 0;
  for (let i = 0; i < reqData.length; i++) {
    if (
      reqData[i][0] == TsTxType.REGISTER ||
      reqData[i][0] == TsTxType.DEPOSIT ||
      reqData[i][0] == TsTxType.FORCE_WITHDRAW
    ) {
      requestNum++;
    }
  }
  return requestNum;
}

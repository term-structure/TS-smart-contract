import { BigNumber, BytesLike, utils } from "ethers";
import fs from "fs";
import { resolve } from "path";
import {
  AUCTION_END_BYTES,
  CHUNK_BYTES,
  FORCE_WITHDRAW_BYTES,
  WITHDRAW_BYTES,
  WITHDRAW_FEE_BYTES,
} from "../../utils/config";
import { EMPTY_HASH, TS_BASE_TOKEN, TsTxType } from "term-structure-sdk";
import {
  CommitBlockStruct,
  ExecuteBlockStruct,
  StoredBlockStruct,
} from "../../typechain-types/contracts/rollup/IRollupFacet";
import { LoanPubData } from "../../utils/type";

export function initTestData(baseDir: string) {
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
      const calldataPath = resolve(baseDir, `${name}-calldata-raw.json`);
      const reqPath = resolve(baseDir, `${name}-input-old.json`);
      const commitmentData = JSON.parse(
        fs.readFileSync(commitmentPath, "utf-8")
      );
      const callData = JSON.parse(fs.readFileSync(calldataPath, "utf-8"));
      const requests = JSON.parse(fs.readFileSync(reqPath, "utf-8"));
      result.push({
        index: index,
        path: resolve(baseDir, file.name),
        commitmentData,
        callData,
        requests,
      });
    }
  }
  return result.sort((a, b) => parseInt(a.index) - parseInt(b.index));
}

export function getPendingRollupTxHash(commitmentData: any) {
  let pendingRollupTxHash = EMPTY_HASH;
  const criticalChunks = getCriticalChunks(commitmentData.isCriticalChunk);
  for (let i = 0; i < criticalChunks.length; i++) {
    const opType = Number(
      "0x" +
        commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2
        )
    );
    let pubData;
    if (opType == Number(TsTxType.FORCE_WITHDRAW)) {
      pubData =
        "0x" +
        commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2 * FORCE_WITHDRAW_BYTES
        );
      pendingRollupTxHash = utils.keccak256(
        utils.solidityPack(["bytes32", "bytes"], [pendingRollupTxHash, pubData])
      );
    } else if (opType == Number(TsTxType.WITHDRAW)) {
      pubData =
        "0x" +
        commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2 * WITHDRAW_BYTES
        );
      pendingRollupTxHash = utils.keccak256(
        utils.solidityPack(["bytes32", "bytes"], [pendingRollupTxHash, pubData])
      );
    } else if (opType == Number(TsTxType.AUCTION_END)) {
      pubData =
        "0x" +
        commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2 * AUCTION_END_BYTES
        );
      pendingRollupTxHash = utils.keccak256(
        utils.solidityPack(["bytes32", "bytes"], [pendingRollupTxHash, pubData])
      );
    } else if (opType == Number(TsTxType.WITHDRAW_FEE)) {
      pubData =
        "0x" +
        commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2 * WITHDRAW_FEE_BYTES
        );
      pendingRollupTxHash = utils.keccak256(
        utils.solidityPack(["bytes32", "bytes"], [pendingRollupTxHash, pubData])
      );
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

export function getRollupTxPubData(testCase: any) {
  const oChunk = testCase.commitmentData.o_chunk;
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
  for (let i = 0; i < testCase.requests.reqData.length; i++) {
    const opType = Number(testCase.requests.reqData[i][0]);
    pubData =
      "0x" +
      oChunk.slice(offset, offset + 2 * bytesOfReq[opType] * CHUNK_BYTES);
    offset += 2 * bytesOfReq[opType] * CHUNK_BYTES;
    rollupTxPubData.push(pubData);
  }
  return rollupTxPubData;
}

export function getPendingRollupTxPubData(testCase: any) {
  const pendingRollupTxPubData = [];
  const criticalChunks = getCriticalChunks(
    testCase.commitmentData.isCriticalChunk
  );
  for (let i = 0; i < criticalChunks.length; i++) {
    const opType = Number(
      "0x" +
        testCase.commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2
        )
    );
    let pubData;
    if (opType == Number(TsTxType.FORCE_WITHDRAW)) {
      pubData =
        "0x" +
        testCase.commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2 * FORCE_WITHDRAW_BYTES
        );
      pendingRollupTxPubData.push(pubData);
    } else if (opType == Number(TsTxType.WITHDRAW)) {
      pubData =
        "0x" +
        testCase.commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2 * WITHDRAW_BYTES
        );
      pendingRollupTxPubData.push(pubData);
    } else if (opType == Number(TsTxType.AUCTION_END)) {
      pubData =
        "0x" +
        testCase.commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2 * AUCTION_END_BYTES
        );
      pendingRollupTxPubData.push(pubData);
    } else if (opType == Number(TsTxType.WITHDRAW_FEE)) {
      pubData =
        "0x" +
        testCase.commitmentData.o_chunk.slice(
          2 + 2 * CHUNK_BYTES * criticalChunks[i],
          2 + 2 * CHUNK_BYTES * criticalChunks[i] + 2 * WITHDRAW_FEE_BYTES
        );
      pendingRollupTxPubData.push(pubData);
    }
  }

  return pendingRollupTxPubData;
}

export function getCommitBlock(
  lastCommittedBlock: StoredBlockStruct,
  testCase: any
) {
  const commitBlock: CommitBlockStruct = {
    blockNumber: BigNumber.from(lastCommittedBlock.blockNumber).add(1),
    newStateRoot: testCase.commitmentData.newStateRoot,
    newTsRoot: testCase.commitmentData.newTsRoot,
    publicData: testCase.commitmentData.o_chunk,
    publicDataOffsets: getPubDataOffset(
      testCase.commitmentData.isCriticalChunk
    ),
    timestamp: testCase.commitmentData.newBlockTimestamp,
  };
  return commitBlock;
}

export function getStoredBlock(commitBlock: CommitBlockStruct, testCase: any) {
  const commitmentHash = stateToCommitmentHash(testCase.commitmentData);
  const l1RequestNum = getL1RequestNum(testCase.requests.reqData);
  const pendingRollupTxHash = getPendingRollupTxHash(testCase.commitmentData);
  const storedBlock: StoredBlockStruct = {
    blockNumber: commitBlock.blockNumber,
    l1RequestNum: l1RequestNum,
    pendingRollupTxHash: pendingRollupTxHash,
    commitment: commitmentHash,
    stateRoot: commitBlock.newStateRoot,
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

export function getCriticalChunks(isCriticalChunk: string) {
  const criticalChunks = [];
  for (let i = 0; i < isCriticalChunk.length; i++) {
    if (isCriticalChunk[i] == "1") {
      criticalChunks.push(Math.floor((i - 2) / 2));
    }
  }
  return criticalChunks;
}

export function getPubDataOffset(isCriticalChunk: BytesLike) {
  const pubDataOffset = [];
  for (let i = 0; i < isCriticalChunk.length; i++) {
    if (isCriticalChunk[i] == "1") {
      pubDataOffset.push((Math.floor(i / 2) - 1) * 12);
    }
  }
  return pubDataOffset;
}

export function stateToCommitmentHash({
  oriStateRoot,
  newStateRoot,
  newTsRoot,
  pubdata,
  newBlockTimestamp,
}: {
  oriStateRoot: string;
  newStateRoot: string;
  newTsRoot: string;
  pubdata: string;
  newBlockTimestamp: string;
}) {
  const commitmentMsg = utils.solidityPack(
    ["bytes32", "bytes32", "bytes32", "uint256", "bytes"],
    [oriStateRoot, newStateRoot, newTsRoot, newBlockTimestamp, pubdata]
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

import { BigNumber } from "ethers";
import { CHUNK_BYTES_SIZE, TsTxType } from "term-structure-sdk";

export const resolveRegisterPubData = (pubData: string) => {
  isValidPubDataLen(pubData);
  const reqType = BigNumber.from("0x" + pubData.slice(2, 4));
  if (reqType.toString() !== TsTxType.REGISTER)
    throw new Error("Invalid reqType");
  const accountId = BigNumber.from("0x" + pubData.slice(4, 12));
  const tsAddr = BigNumber.from("0x" + pubData.slice(12, 52));
  return {
    reqType,
    accountId,
    tsAddr,
  };
};

export const resolveDepositPubData = (pubData: string) => {
  isValidPubDataLen(pubData);
  const reqType = BigNumber.from("0x" + pubData.slice(2, 4));
  if (reqType.toString() !== TsTxType.DEPOSIT)
    throw new Error("Invalid reqType");
  const accountId = BigNumber.from("0x" + pubData.slice(4, 12));
  const tokenId = BigNumber.from("0x" + pubData.slice(12, 16));
  const amount = BigNumber.from("0x" + pubData.slice(16, 48));
  return {
    reqType,
    accountId,
    tokenId,
    amount,
  };
};

export const resolveForceWithdrawPubData = (pubData: string) => {
  isValidPubDataLen(pubData);
  const reqType = BigNumber.from("0x" + pubData.slice(2, 4));
  if (reqType.toString() !== TsTxType.FORCE_WITHDRAW)
    throw new Error("Invalid reqType");
  const accountId = BigNumber.from("0x" + pubData.slice(4, 12));
  const tokenId = BigNumber.from("0x" + pubData.slice(12, 16));
  const amount = BigNumber.from("0x" + pubData.slice(16, 48));
  return {
    reqType,
    accountId,
    tokenId,
    amount,
  };
};

export const resolveCreateTsbTokenPubData = (pubData: string) => {
  isValidPubDataLen(pubData);
  const reqType = BigNumber.from("0x" + pubData.slice(2, 4));
  if (reqType.toString() !== TsTxType.CREATE_TSB_TOKEN)
    throw new Error("Invalid reqType");
  const maturityTime = BigNumber.from("0x" + pubData.slice(4, 12));
  const baseTokenId = BigNumber.from("0x" + pubData.slice(12, 16));
  const tsbTokenId = BigNumber.from("0x" + pubData.slice(16, 20));
  return {
    reqType,
    maturityTime,
    baseTokenId,
    tsbTokenId,
  };
};

export const resolveRollBorrowOrderPubData = (pubData: string) => {
  isValidPubDataLen(pubData);
  const reqType = BigNumber.from("0x" + pubData.slice(2, 4));
  if (reqType.toString() !== "26") throw new Error("Invalid reqType"); // TODO: update sdk to use enum
  const accountId = BigNumber.from("0x" + pubData.slice(4, 12));
  const collateralTokenId = BigNumber.from("0x" + pubData.slice(12, 16));
  const collateralAmt = BigNumber.from("0x" + pubData.slice(16, 48));
  const feeRate = BigNumber.from("0x" + pubData.slice(48, 56));
  const borrowTokenId = BigNumber.from("0x" + pubData.slice(56, 60));
  const borrowAmt = BigNumber.from("0x" + pubData.slice(60, 92));
  const oldMaturityTime = BigNumber.from("0x" + pubData.slice(92, 100));
  const newMaturityTime = BigNumber.from("0x" + pubData.slice(100, 108));
  const expiredTime = BigNumber.from("0x" + pubData.slice(108, 116));
  const pIR = BigNumber.from("0x" + pubData.slice(116, 124));
  return {
    reqType,
    accountId,
    collateralTokenId,
    collateralAmt,
    feeRate,
    borrowTokenId,
    borrowAmt,
    oldMaturityTime,
    newMaturityTime,
    expiredTime,
    pIR,
  };
};

export const resolveCancelRollBorrowPubData = (pubData: string) => {
  isValidPubDataLen(pubData);
  const reqType = BigNumber.from("0x" + pubData.slice(2, 4));
  if (
    reqType.toString() !== "30" &&
    reqType.toString() !== "31" &&
    reqType.toString() !== "32"
  )
    throw new Error("Invalid reqType"); // TODO: update sdk to use enum
  const accountId = BigNumber.from("0x" + pubData.slice(4, 12));
  const debtTokenId = BigNumber.from("0x" + pubData.slice(12, 16));
  const collateralTokenId = BigNumber.from("0x" + pubData.slice(16, 20));
  const maturityTime = BigNumber.from("0x" + pubData.slice(20, 28));
  return {
    reqType,
    accountId,
    debtTokenId,
    collateralTokenId,
    maturityTime,
  };
};

export const resolveRollOverEndPubData = (pubData: string) => {
  isValidPubDataLen(pubData);
  const reqType = BigNumber.from("0x" + pubData.slice(2, 4));
  if (reqType.toString() !== "29") throw new Error("Invalid reqType"); // TODO: update sdk to use enum
  const accountId = BigNumber.from("0x" + pubData.slice(4, 12));
  const collateralTokenId = BigNumber.from("0x" + pubData.slice(12, 16));
  const collateralAmt = BigNumber.from("0x" + pubData.slice(16, 48));
  const debtTokenId = BigNumber.from("0x" + pubData.slice(48, 52));
  const oldMaturityTime = BigNumber.from("0x" + pubData.slice(52, 60));
  const newMaturityTime = BigNumber.from("0x" + pubData.slice(60, 68));
  const debtAmt = BigNumber.from("0x" + pubData.slice(68, 100));
  const matchedTime = BigNumber.from("0x" + pubData.slice(100, 108));
  const borrowAmt = BigNumber.from("0x" + pubData.slice(108, 140));
  return {
    reqType,
    accountId,
    collateralTokenId,
    collateralAmt,
    debtTokenId,
    oldMaturityTime,
    newMaturityTime,
    debtAmt,
    matchedTime,
    borrowAmt,
  };
};

export const isValidPubDataLen = (pubData: string) => {
  // remove '0x'
  if (pubData.slice(2).length % CHUNK_BYTES_SIZE !== 0) return false;
};

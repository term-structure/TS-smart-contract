import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, TypedDataDomain, TypedDataField, ethers } from "ethers";
import { RollBorrowOrderStruct } from "../../typechain-types/contracts/zkTrueUp/loan/LoanFacet";

export const signRedeemPermit = async (
  signer: SignerWithAddress,
  verifyingContract: string,
  tsbTokenAddr: string,
  amount: BigNumber,
  redeemAndDeposit: boolean,
  nonce: BigNumber,
  deadline: BigNumber
) => {
  const domain: TypedDataDomain = {
    name: "ZkTrueUp",
    version: "1",
    chainId: await signer.getChainId(),
    verifyingContract: verifyingContract,
  };

  const types: Record<string, TypedDataField[]> = {
    Redeem: [
      { name: "tsbToken", type: "address" },
      { name: "amount", type: "uint128" },
      { name: "redeemAndDeposit", type: "bool" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const value: Record<string, any> = {
    tsbToken: tsbTokenAddr,
    amount: amount,
    redeemAndDeposit: redeemAndDeposit,
    nonce: nonce,
    deadline: deadline,
  };

  const signature = await signer._signTypedData(domain, types, value);
  const { v, r, s } = ethers.utils.splitSignature(signature);

  return { v, r, s };
};

export const signRollBorrowPermit = async (
  signer: SignerWithAddress,
  verifyingContract: string,
  rollBorrowOrder: RollBorrowOrderStruct,
  nonce: BigNumber,
  deadline: BigNumber
) => {
  const domain: TypedDataDomain = {
    name: "ZkTrueUp",
    version: "1",
    chainId: await signer.getChainId(),
    verifyingContract: verifyingContract,
  };

  const types: Record<string, TypedDataField[]> = {
    RollBorrow: [
      { name: "loanId", type: "bytes12" },
      { name: "expiredTime", type: "uint32" },
      { name: "maxAnnualPercentageRate", type: "uint32" },
      { name: "maxCollateralAmt", type: "uint128" },
      { name: "maxBorrowAmt", type: "uint128" },
      { name: "tsbTokenAddr", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value: Record<string, any> = {
    loanId: rollBorrowOrder.loanId,
    expiredTime: rollBorrowOrder.expiredTime,
    maxAnnualPercentageRate: rollBorrowOrder.maxAnnualPercentageRate,
    maxCollateralAmt: rollBorrowOrder.maxCollateralAmt,
    maxBorrowAmt: rollBorrowOrder.maxBorrowAmt,
    tsbTokenAddr: rollBorrowOrder.tsbToken,
    nonce: nonce,
    deadline: deadline,
  };

  const signature = await signer._signTypedData(domain, types, value);
  const { v, r, s } = ethers.utils.splitSignature(signature);

  return { v, r, s };
};

export const signRepayPermit = async (
  signer: SignerWithAddress,
  verifyingContract: string,
  loanId: string,
  collateralAmt: BigNumber,
  debtAmt: BigNumber,
  repayAndDeposit: boolean,
  nonce: BigNumber,
  deadline: BigNumber
) => {
  const domain: TypedDataDomain = {
    name: "ZkTrueUp",
    version: "1",
    chainId: await signer.getChainId(),
    verifyingContract: verifyingContract,
  };

  const types: Record<string, TypedDataField[]> = {
    Repay: [
      { name: "loanId", type: "bytes12" },
      { name: "collateralAmt", type: "uint128" },
      { name: "debtAmt", type: "uint128" },
      { name: "repayAndDeposit", type: "bool" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value: Record<string, any> = {
    loanId: loanId,
    collateralAmt: collateralAmt,
    debtAmt: debtAmt,
    repayAndDeposit: repayAndDeposit,
    nonce: nonce,
    deadline: deadline,
  };

  const signature = await signer._signTypedData(domain, types, value);
  const { v, r, s } = ethers.utils.splitSignature(signature);

  return { v, r, s };
};

export const signRemoveCollateralPermit = async (
  signer: SignerWithAddress,
  verifyingContract: string,
  loanId: string,
  amount: BigNumber,
  nonce: BigNumber,
  deadline: BigNumber
) => {
  const domain: TypedDataDomain = {
    name: "ZkTrueUp",
    version: "1",
    chainId: await signer.getChainId(),
    verifyingContract: verifyingContract,
  };

  const types: Record<string, TypedDataField[]> = {
    RemoveCollateral: [
      { name: "loanId", type: "bytes12" },
      { name: "amount", type: "uint128" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value: Record<string, any> = {
    loanId,
    amount,
    nonce: nonce,
    deadline: deadline,
  };

  const signature = await signer._signTypedData(domain, types, value);
  const { v, r, s } = ethers.utils.splitSignature(signature);

  return { v, r, s };
};

export const signWithdrawPermit = async (
  signer: SignerWithAddress,
  verifyingContract: string,
  token: string,
  amount: BigNumber,
  nonce: BigNumber,
  deadline: BigNumber
) => {
  const domain: TypedDataDomain = {
    name: "ZkTrueUp",
    version: "1",
    chainId: await signer.getChainId(),
    verifyingContract: verifyingContract,
  };

  const types: Record<string, TypedDataField[]> = {
    Withdraw: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value: Record<string, any> = {
    token: token,
    amount: amount,
    nonce: nonce,
    deadline: deadline,
  };

  const signature = await signer._signTypedData(domain, types, value);
  const { v, r, s } = ethers.utils.splitSignature(signature);

  return { v, r, s };
};

export const signRollToAavePermit = async (
  signer: SignerWithAddress,
  verifyingContract: string,
  loanId: string,
  collateralAmt: BigNumber,
  debtAmt: BigNumber,
  nonce: BigNumber,
  deadline: BigNumber
) => {
  const domain: TypedDataDomain = {
    name: "ZkTrueUp",
    version: "1",
    chainId: await signer.getChainId(),
    verifyingContract: verifyingContract,
  };

  const types: Record<string, TypedDataField[]> = {
    RollToAave: [
      { name: "loanId", type: "bytes12" },
      { name: "collateralAmt", type: "uint128" },
      { name: "debtAmt", type: "uint128" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value: Record<string, any> = {
    loanId,
    collateralAmt,
    debtAmt,
    nonce: nonce,
    deadline: deadline,
  };

  const signature = await signer._signTypedData(domain, types, value);
  const { v, r, s } = ethers.utils.splitSignature(signature);

  return { v, r, s };
};

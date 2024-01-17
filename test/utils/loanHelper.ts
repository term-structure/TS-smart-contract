export const resolveLoanId = (loanId: string) => {
  if (loanId.length !== 26) {
    throw new Error("Invalid loan id");
  }
  const accountId = parseInt(loanId.slice(2, 10), 16); // 4 bytes
  const maturityTime = parseInt(loanId.slice(10, 18), 16); // 4 bytes
  const debtTokenId = parseInt(loanId.slice(18, 22), 16); // 2 bytes
  const collateralTokenId = parseInt(loanId.slice(22, 26), 16); // 2 bytes

  return {
    accountId,
    maturityTime,
    debtTokenId,
    collateralTokenId,
  };
};

export const calcLoanId = (
  accountId: number,
  maturityTime: number,
  debtTokenId: number,
  collateralTokenId: number
) => {
  const loanId =
    "0x" +
    accountId.toString(16).padStart(8, "0") +
    maturityTime.toString(16).padStart(8, "0") +
    debtTokenId.toString(16).padStart(4, "0") +
    collateralTokenId.toString(16).padStart(4, "0");
  return loanId;
};

import { BigNumber, Signer } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { TS_BASE_TOKEN, TS_SYSTEM_DECIMALS } from "term-structure-sdk";
import { DEFAULT_ZERO_ADDR } from "../../utils/config";
import { BaseTokenAddresses } from "../../utils/type";
import {
  AccountFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
} from "../../typechain-types";
import { AssetConfigStruct } from "../../typechain-types/contracts/zkTrueUp/token/ITokenFacet";
import { RollBorrowOrderStruct } from "../../typechain-types/contracts/zkTrueUp/loan/LoanFacet";
import {
  CommitBlockStruct,
  ProofStruct,
  StoredBlockStruct,
} from "../../typechain-types/contracts/test/RollupMock";
import { calcLoanId } from "./loanHelper";
import {
  resolveCancelRollBorrowPubData,
  resolveCreateTsbTokenPubData,
  resolveDepositPubData,
  resolveRegisterPubData,
  resolveRollBorrowOrderPubData,
} from "./publicDataHelper";

export const getDecimals = (tokenId: number): number => {
  let tokenDecimals;
  Object.values(TS_BASE_TOKEN).forEach((token) => {
    if (tokenId.toString() == token.tokenId.toString()) {
      tokenDecimals = token.decimals;
    }
  });
  if (!tokenDecimals) throw new Error("Token not found");
  return tokenDecimals;
};

export const toL1Amt = (l2Amt: BigNumber, l1Dec: number) => {
  return BigNumber.from(l2Amt)
    .mul(BigNumber.from(10).pow(l1Dec))
    .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));
};

export class User {
  registered = false;
  constructor(
    public signer: Signer,
    public tsPubKeyX: string,
    public tsPubKeyY: string
  ) {}
  async mint(tokenId: number, tokenAddr: string, l2_amount: BigNumber) {
    const tokenDecimals = getDecimals(tokenId);

    const amount = toL1Amt(l2_amount, tokenDecimals);

    if (tokenId.toString() != TS_BASE_TOKEN.ETH.tokenId.toString()) {
      await (await ethers.getContractAt("ERC20Mock", tokenAddr))
        .connect(this.signer)
        .mint(await this.signer.getAddress(), amount);
    } else {
      // do nothing, ETH is already in the account
    }
  }
  async register(
    diamondAcc: AccountFacet,
    tokenId: number,
    tokenAddr: string,
    l2_amount: BigNumber
  ) {
    if (this.registered) throw new Error("User already registered");

    const tokenDecimals = getDecimals(tokenId);
    const amount = toL1Amt(l2_amount, tokenDecimals);

    if (tokenId.toString() != TS_BASE_TOKEN.ETH.tokenId.toString()) {
      await (await ethers.getContractAt("ERC20Mock", tokenAddr))
        .connect(this.signer)
        .approve(diamondAcc.address, amount);
    } else {
      // do nothing, ETH doesn't need to be approved
    }

    await diamondAcc
      .connect(this.signer)
      .register(
        BigNumber.from(this.tsPubKeyX),
        BigNumber.from(this.tsPubKeyY),
        tokenAddr,
        BigNumber.from(amount)
      );
    this.registered = true;
  }
  async deposit(
    diamondAcc: AccountFacet,
    tokenId: number,
    tokenAddr: string,
    l2_amount: BigNumber
  ) {
    if (!this.registered) throw new Error("User not registered");

    const tokenDecimals = getDecimals(tokenId);
    const amount = toL1Amt(l2_amount, tokenDecimals);

    if (tokenId.toString() != TS_BASE_TOKEN.ETH.tokenId.toString())
      await (await ethers.getContractAt("ERC20Mock", tokenAddr))
        .connect(this.signer)
        .approve(diamondAcc.address, amount);

    await diamondAcc
      .connect(this.signer)
      .deposit(
        await this.signer.getAddress(),
        tokenAddr,
        BigNumber.from(amount)
      );
  }

  async addCollateral(
    diamondAcc: AccountFacet,
    diamondLoan: LoanFacet,
    tokenAddr: string,
    collateralTokenId: BigNumber,
    l2_amount: BigNumber,
    borrowTokenId: BigNumber,
    oldMaturityTime: BigNumber
  ) {
    if (!this.registered) throw new Error("User not registered");

    const accountId = await diamondAcc.getAccountId(
      await this.signer.getAddress()
    );
    const loanId = calcLoanId(
      accountId,
      Number(oldMaturityTime),
      Number(borrowTokenId),
      Number(collateralTokenId)
    );

    const collateralTokenDecimals = getDecimals(collateralTokenId.toNumber());
    const amount = toL1Amt(l2_amount, collateralTokenDecimals);

    if (collateralTokenId.toString() != TS_BASE_TOKEN.ETH.tokenId.toString())
      await (await ethers.getContractAt("ERC20Mock", tokenAddr))
        .connect(this.signer)
        .approve(diamondLoan.address, amount);
    await diamondLoan.connect(this.signer).addCollateral(loanId, amount);
  }

  async rollBorrow(
    diamondAcc: AccountFacet,
    diamondLoan: LoanFacet,
    tsbTokenAddr: string,
    collateralTokenId: BigNumber,
    collateralAmt: BigNumber,
    borrowTokenId: BigNumber,
    borrowAmt: BigNumber,
    oldMaturityTime: BigNumber,
    expiredTime: BigNumber,
    pIR: BigNumber
  ) {
    if (!this.registered) throw new Error("User not registered");

    const accountId = await diamondAcc.getAccountId(
      await this.signer.getAddress()
    );
    const loanId = calcLoanId(
      accountId,
      Number(oldMaturityTime),
      Number(borrowTokenId),
      Number(collateralTokenId)
    );

    const borrowTokenDecimals = getDecimals(borrowTokenId.toNumber());
    const maxBorrowAmt = toL1Amt(borrowAmt, borrowTokenDecimals);

    const collateralTokenDecimals = getDecimals(collateralTokenId.toNumber());
    const maxCollateralAmt = toL1Amt(collateralAmt, collateralTokenDecimals);

    const rollBorrowOrder: RollBorrowOrderStruct = {
      loanId,
      expiredTime,
      maxAnnualPercentageRate: pIR.sub(100000000), // convert PIR to APR (i.e. 105% PIR -> 5% APR)
      maxCollateralAmt,
      maxBorrowAmt,
      tsbTokenAddr,
    };

    const rollOverFee = await diamondLoan.getRollOverFee();
    await diamondLoan
      .connect(this.signer)
      .rollBorrow(rollBorrowOrder, { value: rollOverFee });
  }
}

export class Users {
  users: User[] = [];
  constructor(public accounts: Signer[]) {}
  addUser(tsPubKeyX: string, tsPubKeyY: string) {
    this.users.push(
      new User(this.accounts[this.users.length], tsPubKeyX, tsPubKeyY)
    );
  }
  getUser(index: number) {
    if (index == 0) throw new Error("User index starts from 1");
    return this.users[index - 1];
  }
}

export const handler = async (
  diamondTsb: TsbFacet,
  diamondToken: TokenFacet,
  diamondLoan: LoanFacet,
  diamondAcc: AccountFacet,
  operator: Signer,
  req: string,
  nextReq: string,
  accounts: Users,
  baseTokenAddresses: BaseTokenAddresses
) => {
  let opType = req.slice(2, 4);
  let numOfL1RequestToBeProcessed: number;

  switch (opType) {
    case "01": {
      const { accountId } = resolveRegisterPubData(req);
      const { tokenId, amount } = resolveDepositPubData(nextReq);
      let user = accounts.getUser(Number(accountId));
      let tokenAddr = baseTokenAddresses[Number(tokenId)];
      await user.mint(Number(tokenId), tokenAddr, amount);
      await user.register(diamondAcc, Number(tokenId), tokenAddr, amount);
      numOfL1RequestToBeProcessed = 2;
      break;
    }
    case "02": {
      const { accountId, tokenId, amount } = resolveDepositPubData(req);
      let user = accounts.getUser(Number(accountId));
      let tokenAddr = baseTokenAddresses[Number(tokenId)];
      await user.mint(Number(tokenId), tokenAddr, amount);
      await user.deposit(diamondAcc, Number(tokenId), tokenAddr, amount);
      numOfL1RequestToBeProcessed = 1;
      break;
    }
    case "15": {
      const { maturityTime, baseTokenId } = resolveCreateTsbTokenPubData(req);
      const name = "TslToken";
      const symbol = "TSL";

      await diamondTsb
        .connect(operator)
        .createTsbToken(baseTokenId, maturityTime, name, symbol);

      const tsbTokenAddr = await diamondTsb.getTsbToken(
        baseTokenId,
        maturityTime
      );

      const assetConfig: AssetConfigStruct = {
        isStableCoin: baseTokenId.lte(BigNumber.from("2")) ? false : true,
        isTsbToken: true,
        decimals: TS_SYSTEM_DECIMALS,
        minDepositAmt: "0",
        token: tsbTokenAddr,
        priceFeed: DEFAULT_ZERO_ADDR,
      };
      await diamondToken.connect(operator).addToken(assetConfig);
      numOfL1RequestToBeProcessed = 1;
      break;
    }
    case "1a": {
      const {
        accountId,
        collateralTokenId,
        collateralAmt,
        borrowTokenId,
        borrowAmt,
        oldMaturityTime,
        newMaturityTime,
        expiredTime,
        pIR,
      } = resolveRollBorrowOrderPubData(req);
      const tsbTokenAddr = await diamondTsb.getTsbToken(
        borrowTokenId,
        newMaturityTime
      );
      const user = accounts.getUser(Number(accountId));

      let tokenId = collateralTokenId.toNumber();
      let tokenAddr = baseTokenAddresses[tokenId];
      await user.mint(tokenId, tokenAddr, collateralAmt);
      await user.addCollateral(
        diamondAcc,
        diamondLoan,
        tokenAddr,
        collateralTokenId,
        collateralAmt,
        borrowTokenId,
        oldMaturityTime
      );
      await user.rollBorrow(
        diamondAcc,
        diamondLoan,
        tsbTokenAddr,
        collateralTokenId,
        collateralAmt,
        borrowTokenId,
        borrowAmt,
        oldMaturityTime,
        expiredTime,
        pIR
      );
      numOfL1RequestToBeProcessed = 1;
      break;
    }
    case "20": {
      const { accountId, debtTokenId, collateralTokenId, maturityTime } =
        resolveCancelRollBorrowPubData(req);

      const loanId = calcLoanId(
        Number(accountId),
        Number(maturityTime),
        Number(debtTokenId),
        Number(collateralTokenId)
      );

      const user = accounts.getUser(Number(accountId));
      await diamondLoan.connect(user.signer).forceCancelRollBorrow(loanId);
      numOfL1RequestToBeProcessed = 1;
      break;
    }
    default:
      throw new Error("Not supported l1 req opType");
  }
  return numOfL1RequestToBeProcessed;
};

export const preprocessBlocks = async (
  blockNumber: number,
  rollupData: any,
  diamondAcc: AccountFacet,
  diamondRollup: RollupFacet,
  diamondTsb: TsbFacet,
  diamondToken: TokenFacet,
  diamondLoan: LoanFacet,
  operator: Signer,
  accounts: Users,
  baseTokenAddresses: BaseTokenAddresses,
  latestStoredBlock: StoredBlockStruct
) => {
  for (let j = 0; j < blockNumber; j++) {
    const block = rollupData.blocks[j];
    for (let i = 0; i < block.l1RequestPubData.length; ) {
      const numOfL1RequestToBeProcessed = await handler(
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
      i += numOfL1RequestToBeProcessed;
    }

    // Mock timestamp to test case timestamp
    await time.increaseTo(Number(block.commitBlock.timestamp));

    await diamondRollup
      .connect(operator)
      .commitBlocks(latestStoredBlock as StoredBlockStruct, [
        block.commitBlock as CommitBlockStruct,
      ]);
    latestStoredBlock = block.storedBlock as StoredBlockStruct;

    await diamondRollup.connect(operator).verifyBlocks([
      {
        storedBlock: latestStoredBlock,
        proof: block.proof as ProofStruct,
      },
    ]);

    await diamondRollup.connect(operator).executeBlocks([
      {
        storedBlock: latestStoredBlock,
        pendingRollupTxPubData: block.pendingRollupTxPubData,
      },
    ]);
  }
  return latestStoredBlock;
};

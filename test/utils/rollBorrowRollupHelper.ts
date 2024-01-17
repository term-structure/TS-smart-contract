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
import { parseEther } from "ethers/lib/utils";
import {
  CommitBlockStruct,
  ProofStruct,
  StoredBlockStruct,
} from "../../typechain-types/contracts/test/RollupMock";

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

export class User {
  registered = false;
  constructor(
    public signer: Signer,
    public tsPubKeyX: string,
    public tsPubKeyY: string
  ) {}
  async mint(tokenId: number, tokenAddr: string, l2_amount: string) {
    const tokenDecimals = getDecimals(tokenId);

    const amount = BigNumber.from(l2_amount)
      .mul(BigNumber.from(10).pow(tokenDecimals))
      .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));

    if (tokenId.toString() != TS_BASE_TOKEN.ETH.tokenId.toString())
      await (await ethers.getContractAt("ERC20Mock", tokenAddr))
        .connect(this.signer)
        .mint(await this.signer.getAddress(), amount);
  }
  async register(
    diamondAcc: AccountFacet,
    tokenId: number,
    tokenAddr: string,
    l2_amount: string
  ) {
    if (this.registered) throw new Error("User already registered");

    const tokenDecimals = getDecimals(tokenId);
    const amount = BigNumber.from(l2_amount)
      .mul(BigNumber.from(10).pow(tokenDecimals))
      .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));

    if (tokenId.toString() != TS_BASE_TOKEN.ETH.tokenId.toString())
      await (await ethers.getContractAt("ERC20Mock", tokenAddr))
        .connect(this.signer)
        .approve(diamondAcc.address, amount);

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
    l2_amount: string
  ) {
    if (!this.registered) throw new Error("User not registered");

    const tokenDecimals = getDecimals(tokenId);
    const amount = BigNumber.from(l2_amount)
      .mul(BigNumber.from(10).pow(tokenDecimals))
      .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));

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
    diamondLoan: LoanFacet,
    diamondAcc: AccountFacet,
    tokenAddr: string,
    collateralTokenId: BigNumber,
    l2_amount: BigNumber,
    borrowTokenId: BigNumber,
    oldMaturityTime: BigNumber
  ) {
    if (!this.registered) throw new Error("User not registered");

    const loanId =
      "0x" +
      BigNumber.from(collateralTokenId)
        .add(BigNumber.from(borrowTokenId).mul(BigNumber.from(2).pow(16)))
        .add(BigNumber.from(oldMaturityTime).mul(BigNumber.from(2).pow(32)))
        .add(BigNumber.from(1).mul(BigNumber.from(2).pow(64)))
        .toHexString()
        .slice(2)
        .padStart(24, "0");

    const collateralTokenDecimals = getDecimals(collateralTokenId.toNumber());
    const amount = l2_amount
      .mul(BigNumber.from(10).pow(collateralTokenDecimals))
      .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));

    if (collateralTokenId.toString() != TS_BASE_TOKEN.ETH.tokenId.toString())
      await (await ethers.getContractAt("ERC20Mock", tokenAddr))
        .connect(this.signer)
        .approve(diamondLoan.address, amount);
    await diamondLoan.connect(this.signer).addCollateral(loanId, amount);
  }

  async rollBorrow(
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

    const loanId =
      "0x" +
      BigNumber.from(collateralTokenId)
        .add(BigNumber.from(borrowTokenId).mul(BigNumber.from(2).pow(16)))
        .add(BigNumber.from(oldMaturityTime).mul(BigNumber.from(2).pow(32)))
        .add(BigNumber.from(1).mul(BigNumber.from(2).pow(64)))
        .toHexString()
        .slice(2)
        .padStart(24, "0");

    const borrowTokenDecimals = getDecimals(borrowTokenId.toNumber());
    const maxBorrowAmt = borrowAmt
      .mul(BigNumber.from(10).pow(borrowTokenDecimals))
      .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));

    const collateralTokenDecimals = getDecimals(collateralTokenId.toNumber());
    const maxCollateralAmt = collateralAmt
      .mul(BigNumber.from(10).pow(collateralTokenDecimals))
      .div(BigNumber.from(10).pow(TS_SYSTEM_DECIMALS));

    const rollBorrowOrder: RollBorrowOrderStruct = {
      loanId,
      expiredTime,
      maxAnnualPercentageRate: pIR.sub(100000000),
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
      let accountId = Number("0x" + req.slice(4, 12));
      let user = accounts.getUser(accountId);
      let tokenId = Number("0x" + nextReq.slice(12, 16));
      let tokenAddr = baseTokenAddresses[tokenId];
      let amount = BigNumber.from("0x" + nextReq.slice(16, 48)).toString();
      await user.mint(tokenId, tokenAddr, amount);
      await user.register(diamondAcc, tokenId, tokenAddr, amount);
      numOfL1RequestToBeProcessed = 2;
      break;
    }
    case "02": {
      let accountId = Number("0x" + req.slice(4, 12));
      let user = accounts.getUser(accountId);
      let tokenId = Number("0x" + req.slice(12, 16));
      let tokenAddr = baseTokenAddresses[tokenId];
      let amount = BigNumber.from("0x" + req.slice(16, 48)).toString();
      await user.mint(tokenId, tokenAddr, amount);
      await user.deposit(diamondAcc, tokenId, tokenAddr, amount);
      numOfL1RequestToBeProcessed = 1;
      break;
    }
    case "15": {
      const maturityTime = BigNumber.from("0x" + req.slice(4, 12));
      const baseTokenId = BigNumber.from("0x" + req.slice(12, 16));
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
        isStableCoin: baseTokenId <= BigNumber.from("2") ? false : true,
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
      const accountId = Number("0x" + req.slice(4, 12));
      const collateralTokenId = BigNumber.from("0x" + req.slice(12, 16));
      const collateralAmt = BigNumber.from("0x" + req.slice(16, 48));
      const feeRate = BigNumber.from("0x" + req.slice(48, 56));
      const borrowTokenId = BigNumber.from("0x" + req.slice(56, 60));
      const borrowAmt = BigNumber.from("0x" + req.slice(60, 92));
      const oldMaturityTime = BigNumber.from("0x" + req.slice(92, 100));
      const newMaturityTime = BigNumber.from("0x" + req.slice(100, 108));
      const expiredTime = BigNumber.from("0x" + req.slice(108, 116));
      const pIR = BigNumber.from("0x" + req.slice(116, 124));
      const tsbTokenAddr = await diamondTsb.getTsbToken(
        borrowTokenId,
        newMaturityTime
      );
      const user = accounts.getUser(accountId);

      let tokenId = collateralTokenId.toNumber();
      let tokenAddr = baseTokenAddresses[tokenId];
      await user.mint(tokenId, tokenAddr, collateralAmt.toString());
      await user.addCollateral(
        diamondLoan,
        diamondAcc,
        tokenAddr,
        collateralTokenId,
        collateralAmt,
        borrowTokenId,
        oldMaturityTime
      );
      await user.rollBorrow(
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
      const accountId = Number("0x" + req.slice(4, 12));
      const debtTokenId = BigNumber.from("0x" + req.slice(12, 16));
      const collateralTokenId = BigNumber.from("0x" + req.slice(16, 20));
      const maturityTime = BigNumber.from("0x" + req.slice(20, 28));

      const loanId =
        "0x" +
        BigNumber.from(collateralTokenId)
          .add(BigNumber.from(debtTokenId).mul(BigNumber.from(2).pow(16)))
          .add(BigNumber.from(maturityTime).mul(BigNumber.from(2).pow(32)))
          .add(BigNumber.from(1).mul(BigNumber.from(2).pow(64)))
          .toHexString()
          .slice(2)
          .padStart(24, "0");

      const user = accounts.getUser(accountId);
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

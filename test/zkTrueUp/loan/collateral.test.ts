import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  BigNumber,
  Signer,
  TypedDataDomain,
  TypedDataField,
  utils,
} from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { register } from "../../utils/register";
import { BaseTokenAddresses, LoanData, PriceFeeds } from "../../../utils/type";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { loanDataJSON, stableCoinPairLoanDataJSON } from "../../data/loanData";
import { updateRoundData } from "../../utils/updateRoundData";
import { toL2Amt } from "../../utils/amountConvertor";
import { roundDataJSON } from "../../data/roundData";
import { getExpectedHealthFactor } from "../../utils/getHealthFactor";
import {
  createAndWhiteListTsbToken,
  whiteListBaseTokens,
} from "../../utils/whitelistToken";
import {
  AccountFacet,
  ERC20Mock,
  LoanFacet,
  RollupMock,
  TokenFacet,
  TsbFacet,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  DEFAULT_ETH_ADDRESS,
  LIQUIDATION_FACTOR,
  STABLECOIN_PAIR_LIQUIDATION_FACTOR,
  TS_BASE_TOKEN,
  TsTokenId,
} from "term-structure-sdk";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

//! use RollupMock instead of RollupFacet for testing
export const FACET_NAMES_MOCK = [
  "AccountFacet",
  "AddressFacet",
  "FlashLoanFacet",
  "ProtocolParamsFacet",
  "LoanFacet",
  "RollupMock", // replace RollupFacet with RollupMock
  "TokenFacet",
  "TsbFacet",
  "EvacuationFacet",
];

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES_MOCK);
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

describe("Collateral", () => {
  let [user1, user2]: SignerWithAddress[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondLoan: LoanFacet;
  let diamondRollupMock: RollupMock;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let priceFeeds: PriceFeeds;

  beforeEach(async () => {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    operator = res.operator;
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUpAddr)) as LoanFacet;
    diamondRollupMock = (await useFacet(
      "RollupMock",
      zkTrueUpAddr
    )) as RollupMock;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    priceFeeds = res.priceFeeds;
  });

  describe("Add/Remove collateral (general case)", () => {
    const ltvThreshold = LIQUIDATION_FACTOR.ltvThreshold;
    const tsbTokenData = tsbTokensJSON[3]; // tsb USDC
    const loanData = loanDataJSON[3]; // ETH -> USDC
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let ethAnswer: BigNumber;
    let usdcAnswer: BigNumber;

    beforeEach(async () => {
      // tsb USDC
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsb,
        operator,
        tsbTokenData
      );

      // ETH decimals = 18
      const decimals = 18;
      // register by ETH
      const registerAmt = utils.parseUnits("10", decimals);
      // register user1
      await register(
        user1,
        Number(TsTokenId.ETH),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get eth price with 8 decimals from test oracle
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];
      const ethRoundDataJSON = roundDataJSON[TsTokenId.ETH][0];
      ethAnswer = await (
        await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON = roundDataJSON[TsTokenId.USDC][0];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );
    });
    it("Success to add collateral (ETH case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();

      // add collateral, amount = 1 ETH
      const amount = utils.parseEther("1");
      const addCollateralTx = await diamondLoan
        .connect(user1)
        .addCollateral(loanId, amount, { value: amount });
      const addCollateralReceipt = await addCollateralTx.wait();

      // gas fee
      const addCollateralGas = BigNumber.from(addCollateralReceipt.gasUsed).mul(
        addCollateralReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();

      // check balance
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.eq(
        amount
      );
      expect(beforeUser1EthBalance.sub(amount).sub(addCollateralGas)).to.eq(
        afterUser1EthBalance
      );

      // check event
      await expect(addCollateralTx)
        .to.emit(diamondLoan, "CollateralAdded")
        .withArgs(loanId, user1Addr, user1Addr, DEFAULT_ETH_ADDRESS, amount);

      // convert amount to 8 decimals for loan data
      const addedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.ETH);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).add(
          addedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to add collateral by another user", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();
      const beforeUser2EthBalance = await user2.getBalance();

      // add collateral, amount = 1 ETH
      const amount = utils.parseEther("1");
      const addCollateralTx = await diamondLoan
        .connect(user2)
        .addCollateral(loanId, amount, { value: amount });
      const addCollateralReceipt = await addCollateralTx.wait();

      // gas fee
      const addCollateralGas = BigNumber.from(addCollateralReceipt.gasUsed).mul(
        addCollateralReceipt.effectiveGasPrice
      );

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();
      const afterUser2EthBalance = await user2.getBalance();

      // check balance
      expect(afterZkTrueUpWethBalance.sub(beforeZkTrueUpWethBalance)).to.eq(
        amount
      );
      expect(beforeUser1EthBalance).to.eq(afterUser1EthBalance);
      expect(beforeUser2EthBalance.sub(amount).sub(addCollateralGas)).to.eq(
        afterUser2EthBalance
      );

      // check event
      await expect(addCollateralTx)
        .to.emit(diamondLoan, "CollateralAdded")
        .withArgs(loanId, user2Addr, user1Addr, DEFAULT_ETH_ADDRESS, amount);

      // convert amount to 8 decimals for loan data
      const addedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.ETH);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).add(
          addedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to remove collateral (ETH case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();

      // remove collateral, amount = 0.2 ETH
      const amount = utils.parseEther("0.2");
      const removeCollateralTx = await diamondLoan
        .connect(user1)
        .removeCollateral(loanId, amount);
      const removeCollateralReceipt = await removeCollateralTx.wait();

      // gas fee
      const removeCollateralGas = BigNumber.from(
        removeCollateralReceipt.gasUsed
      ).mul(removeCollateralReceipt.effectiveGasPrice);

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.equal(
        amount
      );
      expect(beforeUser1EthBalance.add(amount).sub(removeCollateralGas)).to.eq(
        afterUser1EthBalance
      );

      // check event
      await expect(removeCollateralTx)
        .to.emit(diamondLoan, "CollateralRemoved")
        .withArgs(loanId, user1Addr, user1Addr, DEFAULT_ETH_ADDRESS, amount);

      // convert amount to 8 decimals for loan data
      const removedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.ETH);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });

    it("Success to remove collateral permit (ETH case)", async () => {
      // before balance
      const beforeZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const beforeUser1EthBalance = await user1.getBalance();

      const domain: TypedDataDomain = {
        name: "ZkTrueUp",
        version: "1",
        chainId: await user1.getChainId(),
        verifyingContract: zkTrueUp.address,
      };

      // bytes32 private constant REMOVE_COLLATERAL_TYPEHASH =
      // keccak256("RemoveCollateral(address delegatee,bytes12 loanId,uint128 amount,uint256 nonce,uint256 deadline)");
      const types: Record<string, TypedDataField[]> = {
        RemoveCollateral: [
          { name: "delegatee", type: "address" },
          { name: "loanId", type: "bytes12" },
          { name: "amount", type: "uint128" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const maxUint32 = BigNumber.from("4294967295");
      const amount = utils.parseEther("0.2");

      const value: Record<string, any> = {
        delegatee: user2Addr,
        loanId,
        amount,
        nonce: await diamondLoan.getNonce(user1Addr),
        deadline: maxUint32,
      };

      const signature = await user1._signTypedData(domain, types, value);
      const { v, r, s } = ethers.utils.splitSignature(signature);

      // remove collateral permit, amount = 0.2 ETH
      const removeCollateralPermitTx = await diamondLoan
        .connect(user2)
        .removeCollateralPermit(loanId, amount, maxUint32, v, r, s);
      const removeCollateralReceipt = await removeCollateralPermitTx.wait();

      // after balance
      const afterZkTrueUpWethBalance = await weth.balanceOf(zkTrueUp.address);
      const afterUser1EthBalance = await user1.getBalance();

      // check balance
      expect(beforeZkTrueUpWethBalance.sub(afterZkTrueUpWethBalance)).to.equal(
        amount
      );
      expect(beforeUser1EthBalance.add(amount)).to.eq(afterUser1EthBalance);

      // check event
      await expect(removeCollateralPermitTx)
        .to.emit(diamondLoan, "CollateralRemoved")
        .withArgs(loanId, user2Addr, user1Addr, DEFAULT_ETH_ADDRESS, amount);

      // convert amount to 8 decimals for loan data
      const removedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.ETH);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });

    it("Fail to remove collateral (ETH case), not the loan owner", async () => {
      // add collateral, amount = 0.1 ETH
      const amount = utils.parseEther("0.1");

      // use user2 to remove collateral
      // check revert
      await expect(
        diamondLoan.connect(user2).removeCollateral(loanId, amount)
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidCaller");
    });

    it("Fail to remove collateral (ETH case), health factor under threshold", async () => {
      // add collateral, amount = 0.5 ETH
      const amount = utils.parseEther("0.5");

      // convert amount to 8 decimals for loan data
      const removedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.ETH);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        ethAnswer,
        usdcAnswer,
        ltvThreshold
      );
      expect(newExpectedHealthFactor).to.lt(1000);

      // check revert
      await expect(
        diamondLoan.connect(user1).removeCollateral(loanId, amount)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsNotHealthy");
    });
  });
  describe("Add/Remove collateral (stable coin pairs case)", () => {
    const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
    const tsbTokenData = tsbTokensJSON[3]; // tsb USDC
    const loanData = stableCoinPairLoanDataJSON[0]; // USDT -> USDC, loan owner is user2
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let usdtAnswer: BigNumber;
    let usdcAnswer: BigNumber;

    beforeEach(async () => {
      // tsb USDC
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsb,
        operator,
        tsbTokenData
      );

      // USDT decimals = 6
      const decimals = TS_BASE_TOKEN.USDT.decimals;
      // register by USDT
      const registerAmt = utils.parseUnits("1000", decimals);
      // register user1
      await register(
        user1,
        Number(TsTokenId.USDT),
        registerAmt,
        baseTokenAddresses,
        diamondAcc
      );

      // DAI decimals = 18
      const decimals2 = TS_BASE_TOKEN.DAI.decimals;
      // register by DAI
      const registerAmt2 = utils.parseUnits("10", decimals2);
      // register user2
      await register(
        user2,
        Number(TsTokenId.DAI),
        registerAmt2,
        baseTokenAddresses,
        diamondAcc
      );

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get usdt price with 8 decimals from test oracle
      const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
      const usdtRoundDataJSON = roundDataJSON[TsTokenId.USDT][0];
      usdtAnswer = await (
        await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
      ).answer;

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON = roundDataJSON[TsTokenId.USDC][0];
      usdcAnswer = await (
        await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
      ).answer;

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );
    });
    it("Success to add collateral (stable coin pairs case)", async () => {
      const usdt = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      )) as ERC20Mock;

      const amount = utils.parseUnits("100", TS_BASE_TOKEN.USDT.decimals);
      await usdt
        .connect(user2)
        .mint(user2Addr, utils.parseUnits("100", TS_BASE_TOKEN.USDT.decimals));

      // before balance
      const beforeZkTrueUpBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUser2Balance = await usdt.balanceOf(user2Addr);

      // user2 approve USDT to zkTrueUp
      await usdt.connect(user2).approve(zkTrueUp.address, amount);

      // loan owner is user2, add collateral by user2
      const addCollateralTx = await diamondLoan
        .connect(user2)
        .addCollateral(loanId, amount);
      await addCollateralTx.wait();

      // after balance
      const afterZkTrueUpBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUser2Balance = await usdt.balanceOf(user2Addr);

      // check balance
      expect(afterZkTrueUpBalance.sub(beforeZkTrueUpBalance)).to.eq(amount);
      expect(beforeUser2Balance.sub(afterUser2Balance)).to.eq(amount);

      // check event
      await expect(addCollateralTx)
        .to.emit(diamondLoan, "CollateralAdded")
        .withArgs(loanId, user2Addr, user2Addr, usdt.address, amount);

      // convert amount to 8 decimals for loan data
      const addedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.USDT);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).add(
          addedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to add collateral by another user (stable coin pairs case)", async () => {
      const usdt = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      )) as ERC20Mock;
      const amount = utils.parseUnits("200", TS_BASE_TOKEN.USDT.decimals);
      await usdt.connect(user1).mint(user1Addr, amount);

      // before balance
      const beforeZkTrueUpBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUser1Balance = await usdt.balanceOf(user1Addr);
      const beforeUser2Balance = await usdt.balanceOf(user2Addr);

      //approve USDT to zkTrueUp
      await usdt.connect(user1).approve(zkTrueUp.address, amount);

      // loan owner is user2, add collateral by user1
      const addCollateralTx = await diamondLoan
        .connect(user1)
        .addCollateral(loanId, amount);
      await addCollateralTx.wait();

      // after balance
      const afterZkTrueUpBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUser1Balance = await usdt.balanceOf(user1Addr);
      const afterUser2Balance = await usdt.balanceOf(user2Addr);

      // check balance
      expect(afterZkTrueUpBalance.sub(beforeZkTrueUpBalance)).to.eq(amount);
      expect(beforeUser1Balance.sub(afterUser1Balance)).to.eq(amount);
      expect(beforeUser2Balance).to.eq(afterUser2Balance);

      // check event
      await expect(addCollateralTx)
        .to.emit(diamondLoan, "CollateralAdded")
        .withArgs(loanId, user1Addr, user2Addr, usdt.address, amount);

      // convert amount to 8 decimals for loan data
      const addedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.USDT);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).add(
          addedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });
    it("Success to remove collateral (stable coin pairs case)", async () => {
      const usdt = (await ethers.getContractAt(
        "ERC20Mock",
        baseTokenAddresses[TsTokenId.USDT]
      )) as ERC20Mock;

      // before balance
      const beforeZkTrueUpBalance = await usdt.balanceOf(zkTrueUp.address);
      const beforeUser2Balance = await usdt.balanceOf(user2Addr);

      // add collateral, amount = 0.5 USDT
      const amount = utils.parseUnits("0.5", TS_BASE_TOKEN.USDT.decimals);
      const removeCollateralTx = await diamondLoan
        .connect(user2)
        .removeCollateral(loanId, amount);
      await removeCollateralTx.wait();

      // after balance
      const afterZkTrueUpBalance = await usdt.balanceOf(zkTrueUp.address);
      const afterUser2Balance = await usdt.balanceOf(user2Addr);

      // check balance
      expect(beforeZkTrueUpBalance.sub(afterZkTrueUpBalance)).to.equal(amount);
      expect(afterUser2Balance.sub(beforeUser2Balance)).to.equal(amount);

      // check event
      await expect(removeCollateralTx)
        .to.emit(diamondLoan, "CollateralRemoved")
        .withArgs(loanId, user2Addr, user2Addr, usdt.address, amount);

      // convert amount to 8 decimals for loan data
      const removedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.USDT);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        usdcAnswer,
        ltvThreshold
      );

      // get new health factor
      const newHealthFactor = await diamondLoan.getHealthFactor(loanId);

      // check health factor
      expect(newHealthFactor).to.equal(newExpectedHealthFactor);
    });

    it("Fail to remove collateral (stable coin pair case), not the loan owner", async () => {
      // add collateral, amount = 1 USDT
      const amount = utils.parseUnits("1", TS_BASE_TOKEN.USDT.decimals);

      // use user2 to remove collateral
      // check revert
      await expect(
        diamondLoan.connect(user1).removeCollateral(loanId, amount)
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidCaller");
    });

    it("Fail to remove collateral (stable coin pair), health factor under threshold", async () => {
      // add collateral, amount = 50 USDT
      const amount = utils.parseUnits("50", TS_BASE_TOKEN.USDT.decimals);
      // check revert
      await expect(
        diamondLoan.connect(user2).removeCollateral(loanId, amount)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsNotHealthy");

      // convert amount to 8 decimals for loan data
      const removedCollateralAmtConverted = toL2Amt(amount, TS_BASE_TOKEN.USDT);

      // new loan data after add collateral
      const newLoan = {
        ...loan,
        collateralAmt: BigNumber.from(loan.collateralAmt).sub(
          removedCollateralAmtConverted
        ),
      };

      // get new expected health factor
      const newExpectedHealthFactor = await getExpectedHealthFactor(
        diamondToken,
        tsbTokenData,
        newLoan,
        usdtAnswer,
        usdcAnswer,
        ltvThreshold
      );
      expect(newExpectedHealthFactor).to.lt(1000);

      // check revert
      await expect(
        diamondLoan.connect(user2).removeCollateral(loanId, amount)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsNotHealthy");
    });
  });
});

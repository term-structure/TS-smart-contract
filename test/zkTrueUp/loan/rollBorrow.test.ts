import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { register } from "../../utils/register";
import {
  BaseTokenAddresses,
  LoanData,
  PriceFeeds,
  TsbTokenData,
} from "../../../utils/type";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { loanDataJSON, stableCoinPairLoanDataJSON } from "../../data/loanData";
import { updateRoundData } from "../../utils/updateRoundData";
import { toL1Amt, toL2Amt } from "../../utils/amountConvertor";
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
  TsbToken,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  DEFAULT_ETH_ADDRESS,
  LIQUIDATION_FACTOR,
  STABLECOIN_PAIR_LIQUIDATION_FACTOR,
  TS_BASE_TOKEN,
  TS_DECIMALS,
  TsTokenId,
} from "term-structure-sdk";
import {
  RollBorrowOrderStruct,
  Operations,
} from "../../../typechain-types/contracts/zkTrueUp/loan/LoanFacet";
import { SYSTEM_DECIMALS_BASE } from "../../../utils/config";

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

describe("Roll Borrow", () => {
  let [user1]: Signer[] = [];
  let [user1Addr]: string[] = [];
  let admin: Signer;
  let operator: Signer;
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
    [user1] = await ethers.getSigners();
    [user1Addr] = await Promise.all([user1.getAddress()]);
    admin = res.admin;
    operator = res.operator;
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

  describe("Roll borrow (ETH case)", () => {
    const tsbTokenData = tsbTokensJSON.filter(
      (token) => token.underlyingAsset === "USDC"
    )[0];
    const loanData = loanDataJSON[3]; // ETH -> USDC
    const loan: LoanData = {
      accountId: loanData.accountId,
      tsbTokenId: loanData.tsbTokenId,
      collateralTokenId: loanData.collateralTokenId,
      collateralAmt: BigNumber.from(loanData.collateralAmt),
      debtAmt: BigNumber.from(loanData.debtAmt),
    };
    let loanId: string;
    let nextTsbTokenData: TsbTokenData;
    let nextTsbTokenAddr: string;

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
      await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON);

      // get usdc price with 8 decimals from test oracle
      const usdcPriceFeed = priceFeeds[TsTokenId.USDC];
      const usdcRoundDataJSON = roundDataJSON[TsTokenId.USDC][0];
      await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON);

      // get loan id
      loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        tsbTokenData.underlyingTokenId,
        loan.collateralTokenId
      );

      await diamondLoan.connect(admin).setActivatedRoller(true);

      nextTsbTokenData = {
        name: "tsbUSDC20241230",
        symbol: "tsbUSDC",
        underlyingAsset: "USDC",
        underlyingTokenId: 4,
        maturity: "1735488000", // 2024/12/30
        isStableCoin: false,
        minDepositAmt: "0",
      };

      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsb,
        operator,
        nextTsbTokenData
      );

      nextTsbTokenAddr = await diamondTsb.getTsbToken(
        nextTsbTokenData.underlyingTokenId,
        BigNumber.from(nextTsbTokenData.maturity)
      );
    });

    it("Success to roll (ETH case)", async () => {
      const beforeLoan = await diamondLoan.getLoan(loanId);

      // borrow order data
      // all debt
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      // 90% of collateral
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      )
        .mul(90)
        .div(100);

      const rollBorrowOrder: RollBorrowOrderStruct = {
        loanId: loanId,
        expiredTime: "1732896000", // 2024/11/30
        annualPercentageRate: BigNumber.from(5e6), // 5% (base 1e8)
        maxCollateralAmt: collateralAmt,
        maxBorrowAmt: debtAmt,
        tsbTokenAddr: nextTsbTokenAddr,
      };

      const rollBorrowTx = await diamondLoan
        .connect(user1)
        .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.01") });
      await rollBorrowTx.wait();

      // check event
      const rollBorrowReq = [
        loan.accountId,
        loan.collateralTokenId,
        nextTsbTokenData.underlyingTokenId,
        Number(nextTsbTokenData.maturity),
        Number(rollBorrowOrder.expiredTime),
        await diamondLoan.getBorrowFeeRate(),
        Number(
          BigNumber.from(rollBorrowOrder.annualPercentageRate).add(
            SYSTEM_DECIMALS_BASE
          )
        ),
        toL2Amt(
          BigNumber.from(rollBorrowOrder.maxCollateralAmt),
          TS_BASE_TOKEN.ETH
        ),
        toL2Amt(
          BigNumber.from(rollBorrowOrder.maxBorrowAmt),
          TS_BASE_TOKEN.USDC
        ),
      ] as Operations.RollBorrowStructOutput;

      // check event
      await expect(rollBorrowTx)
        .to.emit(diamondLoan, "RollBorrowOrderPlaced")
        .withArgs(user1Addr, rollBorrowReq);

      // check loan
      const afterLoan = await diamondLoan.getLoan(loanId);
      expect(afterLoan.collateralAmt.sub(beforeLoan.collateralAmt)).to.equal(0);
      expect(afterLoan.debtAmt.sub(beforeLoan.debtAmt)).to.equal(0);
      expect(
        afterLoan.lockedCollateralAmt.sub(beforeLoan.lockedCollateralAmt)
      ).to.equal(rollBorrowOrder.maxCollateralAmt);
      // check roll borrow order in L1 request queue
      const [, , requestNum] = await diamondRollupMock.getL1RequestNum();
      expect(
        await diamondRollupMock.isRollBorrowInL1RequestQueue(
          rollBorrowReq,
          requestNum.sub(1)
        )
      ).to.be.true;
    });

    it("Fail to roll, original loan will be not strict healthy (ETH case)", async () => {
      // remain 50% of debt but move all collateral to new loan, it make the original loan not strict healthy
      // 50% of debt
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      )
        .mul(50)
        .div(100);
      // all of collateral
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      );

      const rollBorrowOrder: RollBorrowOrderStruct = {
        loanId: loanId,
        expiredTime: "1732896000", // 2024/11/30
        annualPercentageRate: BigNumber.from(5e6), // 5% (base 1e8)
        maxCollateralAmt: collateralAmt,
        maxBorrowAmt: debtAmt,
        tsbTokenAddr: nextTsbTokenAddr,
      };

      // want to roll again but loan is locked
      await expect(
        diamondLoan
          .connect(user1)
          .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.01") })
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsNotStrictHealthy");
    });

    it("Fail to roll, new loan will be not strict healthy (ETH case)", async () => {
      // remain 50% of collateral but move all debt to new loan, it make the new loan not strict healthy
      // all of debt
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      // 50% of collateral
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      )
        .mul(50)
        .div(100);

      const rollBorrowOrder: RollBorrowOrderStruct = {
        loanId: loanId,
        expiredTime: "1732896000", // 2024/11/30
        annualPercentageRate: BigNumber.from(5e6), // 5% (base 1e8)
        maxCollateralAmt: collateralAmt,
        maxBorrowAmt: debtAmt,
        tsbTokenAddr: nextTsbTokenAddr,
      };

      // want to roll again but loan is locked
      await expect(
        diamondLoan
          .connect(user1)
          .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.01") })
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsNotStrictHealthy");
    });

    it("Fail to roll, invalid roll borrow fee (ETH case)", async () => {
      // borrow order data
      // all debt
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      // 90% of collateral
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      )
        .mul(90)
        .div(100);

      const rollBorrowOrder: RollBorrowOrderStruct = {
        loanId: loanId,
        expiredTime: "1732896000", // 2024/11/30
        annualPercentageRate: BigNumber.from(5e6), // 5% (base 1e8)
        maxCollateralAmt: collateralAmt,
        maxBorrowAmt: debtAmt,
        tsbTokenAddr: nextTsbTokenAddr,
      };

      // set invalid roll borrow fee 0.005 ETH
      await expect(
        diamondLoan
          .connect(user1)
          .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.005") })
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidRollBorrowFee");
    });

    it("Fail to roll, loan is locked (ETH case)", async () => {
      // borrow order data
      // all debt
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      // 90% of collateral
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      )
        .mul(90)
        .div(100);

      const rollBorrowOrder: RollBorrowOrderStruct = {
        loanId: loanId,
        expiredTime: "1732896000", // 2024/11/30
        annualPercentageRate: BigNumber.from(5e6), // 5% (base 1e8)
        maxCollateralAmt: collateralAmt,
        maxBorrowAmt: debtAmt,
        tsbTokenAddr: nextTsbTokenAddr,
      };

      // success to roll
      const rollBorrowTx = await diamondLoan
        .connect(user1)
        .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.01") });
      await rollBorrowTx.wait();

      // want to roll again but loan is locked
      await expect(
        diamondLoan
          .connect(user1)
          .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.01") })
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsLocked");
    });

    it("Fail to roll, invalid TSB token (ETH case)", async () => {
      // borrow order data
      // all debt
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      // 90% of collateral
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      )
        .mul(90)
        .div(100);

      const invalidTsbTokenAddr = utils.hexlify(utils.randomBytes(20));
      const rollBorrowOrder: RollBorrowOrderStruct = {
        loanId: loanId,
        expiredTime: "1732896000", // 2024/11/30
        annualPercentageRate: BigNumber.from(5e6), // 5% (base 1e8)
        maxCollateralAmt: collateralAmt,
        maxBorrowAmt: debtAmt,
        tsbTokenAddr: invalidTsbTokenAddr,
      };

      // roll to an invalid TSB token address
      await expect(
        diamondLoan
          .connect(user1)
          .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.01") })
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidTsbTokenAddr");
    });

    it("Fail to roll, invalid expired time (ETH case)", async () => {
      // borrow order data
      // all debt
      const debtAmt = toL1Amt(
        BigNumber.from(loanData.debtAmt),
        TS_BASE_TOKEN.USDC
      );
      // 90% of collateral
      const collateralAmt = toL1Amt(
        BigNumber.from(loanData.collateralAmt),
        TS_BASE_TOKEN.ETH
      )
        .mul(90)
        .div(100);

      // invalid expired time < block.timestamp
      const invalidExpiredTime1 = "1609430400"; // 2021/1/1 00:00:00
      let rollBorrowOrder: RollBorrowOrderStruct = {
        loanId: loanId,
        expiredTime: invalidExpiredTime1,
        annualPercentageRate: BigNumber.from(5e6), // 5% (base 1e8)
        maxCollateralAmt: collateralAmt,
        maxBorrowAmt: debtAmt,
        tsbTokenAddr: nextTsbTokenAddr,
      };

      await expect(
        diamondLoan
          .connect(user1)
          .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.01") })
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidExpiredTime");

      // within one day to maturity time
      const invalidExpiredTime2 = BigNumber.from(nextTsbTokenData.maturity)
        .sub(1)
        .toString();
      rollBorrowOrder = {
        ...rollBorrowOrder,
        expiredTime: invalidExpiredTime2,
      };

      //
      await expect(
        diamondLoan
          .connect(user1)
          .rollBorrow(rollBorrowOrder, { value: utils.parseEther("0.01") })
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidExpiredTime");
    });
  });
  // describe("RollBorrow (stable coin pairs case)", () => {
  //   const ltvThreshold = STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold;
  //   const tsbTokenData = tsbTokensJSON.filter(
  //     (token) => token.underlyingAsset === "DAI"
  //   )[0];
  //   const loanData = stableCoinPairLoanDataJSON[1]; // USDT -> DAI, loan owner is user2
  //   const loan: LoanData = {
  //     accountId: loanData.accountId,
  //     tsbTokenId: loanData.tsbTokenId,
  //     collateralTokenId: loanData.collateralTokenId,
  //     collateralAmt: BigNumber.from(loanData.collateralAmt),
  //     debtAmt: BigNumber.from(loanData.debtAmt),
  //   };
  //   let loanId: string;
  //   let usdtAnswer: BigNumber;
  //   let daiAnswer: BigNumber;
  //   let usdt: ERC20Mock;
  //   let dai: ERC20Mock;

  //   beforeEach(async () => {
  //     // tsb USDC
  //     await createAndWhiteListTsbToken(
  //       diamondToken,
  //       diamondTsb,
  //       operator,
  //       tsbTokenData
  //     );

  //     // USDT decimals = 6
  //     const decimals = TS_BASE_TOKEN.USDT.decimals;
  //     // register by USDT
  //     const registerAmt = utils.parseUnits("1000", decimals);
  //     // register user1
  //     await register(
  //       user1,
  //       Number(TsTokenId.USDT),
  //       registerAmt,
  //       baseTokenAddresses,
  //       diamondAcc
  //     );

  //     // DAI decimals = 18
  //     const decimals2 = TS_BASE_TOKEN.DAI.decimals;
  //     // register by DAI
  //     const registerAmt2 = utils.parseUnits("10", decimals2);
  //     // register user2
  //     await register(
  //       user2,
  //       Number(TsTokenId.DAI),
  //       registerAmt2,
  //       baseTokenAddresses,
  //       diamondAcc
  //     );

  //     // update test loan data
  //     const updateLoanTx = await diamondRollupMock
  //       .connect(operator)
  //       .updateLoanMock(loan);
  //     await updateLoanTx.wait();

  //     // get usdt price with 8 decimals from test oracle
  //     const usdtPriceFeed = priceFeeds[TsTokenId.USDT];
  //     const usdtRoundDataJSON = roundDataJSON[Number(TsTokenId.USDT)][0];
  //     usdtAnswer = await (
  //       await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
  //     ).answer;

  //     // get dai price with 8 decimals from test oracle
  //     const daiPriceFeed = priceFeeds[TsTokenId.DAI];
  //     const daiRoundDataJSON = roundDataJSON[Number(TsTokenId.DAI)][0];
  //     daiAnswer = await (
  //       await updateRoundData(operator, daiPriceFeed, daiRoundDataJSON)
  //     ).answer;

  //     // get loan id
  //     loanId = await diamondLoan.getLoanId(
  //       loan.accountId,
  //       BigNumber.from(tsbTokenData.maturity),
  //       tsbTokenData.underlyingTokenId,
  //       loan.collateralTokenId
  //     );

  //     // get usdt contract
  //     usdt = await ethers.getContractAt(
  //       "ERC20Mock",
  //       baseTokenAddresses[TsTokenId.USDT]
  //     );

  //     // give user2 10000 DAI for repay test
  //     dai = await ethers.getContractAt(
  //       "ERC20Mock",
  //       baseTokenAddresses[TsTokenId.DAI]
  //     );
  //     const amount = utils.parseUnits("10000", TS_BASE_TOKEN.DAI.decimals);
  //     await dai.connect(user2).mint(user2Addr, amount);

  //     // user2 approve to ZkTrueUp
  //     await dai
  //       .connect(user2)
  //       .approve(zkTrueUp.address, ethers.constants.MaxUint256);
  //   });
  // });
});

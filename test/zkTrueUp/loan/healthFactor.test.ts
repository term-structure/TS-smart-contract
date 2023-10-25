import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { register } from "../../utils/register";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { loanDataJSON, stableCoinPairLoanDataJSON } from "../../data/loanData";
import { updateRoundData } from "../../utils/updateRoundData";
import { roundDataJSON } from "../../data/roundData";
import { getExpectedHealthFactor } from "../../utils/getHealthFactor";
import {
  BaseTokenAddresses,
  LoanData,
  PriceFeeds,
  RoundData,
} from "../../../utils/type";
import {
  createAndWhiteListTsbToken,
  whiteListBaseTokens,
} from "../../utils/whitelistToken";
import {
  AccountFacet,
  LoanFacet,
  RollupMock,
  TokenFacet,
  TsbFacet,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  LIQUIDATION_FACTOR,
  STABLECOIN_PAIR_LIQUIDATION_FACTOR,
  TS_DECIMALS,
  TsTokenId,
} from "term-structure-sdk";

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

describe("Health factor", () => {
  let [user1, user2]: Signer[] = [];
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
    [user1, user2] = await ethers.getSigners();
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

  describe("Update loan mock", () => {
    it("Success to get loan id, and resolve loan id", async () => {
      const loanData = loanDataJSON[0];

      // tsb ETH
      const tsbTokenData = tsbTokensJSON[loanData.debtTokenId];
      await createAndWhiteListTsbToken(
        diamondToken,
        diamondTsb,
        operator,
        tsbTokenData
      );

      // test update loan
      const loan: LoanData = {
        accountId: 0,
        tsbTokenId: loanData.tsbTokenId,
        collateralTokenId: loanData.collateralTokenId,
        collateralAmt: BigNumber.from(loanData.collateralAmt),
        debtAmt: BigNumber.from(loanData.debtAmt),
      };

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get loan id
      const loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        loanData.debtTokenId,
        loan.collateralTokenId
      );
      const [accountId, maturityTime, debtTokenId, collateralTokenId] =
        await diamondLoan.resolveLoanId(loanId);
      expect(accountId).to.equal(loan.accountId);
      expect(maturityTime).to.equal(BigNumber.from(tsbTokenData.maturity));
      expect(debtTokenId).to.equal(loanData.debtTokenId);
      expect(collateralTokenId).to.equal(loanData.collateralTokenId);
    });
    it("Fail to get health factor, loan is not exist", async () => {
      const loanData = loanDataJSON[0];
      // tsb ETH
      const tsbTokenData = tsbTokensJSON[loanData.debtTokenId];
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

      // test update loan
      const loan: LoanData = {
        accountId: 0,
        tsbTokenId: loanData.tsbTokenId,
        collateralTokenId: loanData.collateralTokenId,
        collateralAmt: BigNumber.from(loanData.collateralAmt),
        debtAmt: BigNumber.from(loanData.debtAmt),
      };

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get loan id
      const loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        loanData.debtTokenId,
        loan.collateralTokenId
      );

      await expect(
        diamondLoan.getHealthFactor(loanId)
      ).to.be.revertedWithCustomError(diamondLoan, "LoanIsNotExist");
    });
    it("Fail to get health factor, invalid price", async () => {
      const loanData = loanDataJSON[0];
      // tsb ETH
      const tsbTokenData = tsbTokensJSON[0];
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

      // test update loan
      const loan: LoanData = {
        accountId: loanData.accountId,
        tsbTokenId: loanData.tsbTokenId,
        collateralTokenId: loanData.collateralTokenId,
        collateralAmt: BigNumber.from(loanData.collateralAmt),
        debtAmt: BigNumber.from(loanData.debtAmt),
      };

      // update test loan data
      const updateLoanTx = await diamondRollupMock
        .connect(operator)
        .updateLoanMock(loan);
      await updateLoanTx.wait();

      // get eth price with 8 decimals from test oracle
      const ethPriceFeed = priceFeeds[TsTokenId.ETH];

      // invalid round data
      const ethRoundData: RoundData = {
        roundId: 1,
        answer: "0",
        startedAt: 0,
        updatedAt: 0,
        answeredInRound: 0,
      };

      // update eth price
      await updateRoundData(operator, ethPriceFeed, ethRoundData);

      // get wbtc price with 8 decimals from test oracle
      const wbtcPriceFeed = priceFeeds[TsTokenId.WBTC];
      const wbtcRoundDataJSON = roundDataJSON[1][0];

      // update wbtc price
      await updateRoundData(operator, wbtcPriceFeed, wbtcRoundDataJSON);

      // get loan id
      const loanId = await diamondLoan.getLoanId(
        loan.accountId,
        BigNumber.from(tsbTokenData.maturity),
        loanData.debtTokenId,
        loan.collateralTokenId
      );

      await expect(
        diamondLoan.getHealthFactor(loanId)
      ).to.be.revertedWithCustomError(diamondLoan, "InvalidPrice");
    });
    for (let i = 0; i < loanDataJSON.length; i++) {
      it(`Success to get health factor (general case ${i + 1})`, async () => {
        const loanData = loanDataJSON[i];
        // tsb ETH
        const tsbTokenData = tsbTokensJSON.filter(
          (token) => token.underlyingTokenId === loanData.debtTokenId
        )[0];

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

        // test update loan
        const loan: LoanData = {
          accountId: loanData.accountId,
          tsbTokenId: loanData.tsbTokenId,
          collateralTokenId: loanData.collateralTokenId,
          collateralAmt: BigNumber.from(loanData.collateralAmt),
          debtAmt: BigNumber.from(loanData.debtAmt),
        };

        // update test loan data
        const updateLoanTx = await diamondRollupMock
          .connect(operator)
          .updateLoanMock(loan);
        await updateLoanTx.wait();

        // get eth price with 8 decimals from test oracle
        const ethPriceFeed = priceFeeds[loanData.debtTokenId];
        const ethRoundDataJSON = roundDataJSON[loanData.debtTokenId][0];
        const ethAnswer = await (
          await updateRoundData(operator, ethPriceFeed, ethRoundDataJSON)
        ).answer;

        // get wbtc price with 8 decimals from test oracle
        const wbtcPriceFeed = priceFeeds[loanData.collateralTokenId];
        const wbtcRoundDataJSON = roundDataJSON[loanData.collateralTokenId][0];
        const wbtcAnswer = await (
          await updateRoundData(operator, wbtcPriceFeed, wbtcRoundDataJSON)
        ).answer;

        // get loan id
        const loanId = await diamondLoan.getLoanId(
          loan.accountId,
          BigNumber.from(tsbTokenData.maturity),
          loanData.debtTokenId,
          loan.collateralTokenId
        );

        // collateral l1 decimals
        const collateralToken = await diamondToken.getAssetConfig(
          loan.collateralTokenId
        );
        const collateralDecimal = collateralToken.decimals;

        // debt l1 decimals
        const debtTokenId = tsbTokenData.underlyingTokenId;
        const debtToken = await diamondToken.getAssetConfig(debtTokenId);
        const debtDecimal = debtToken.decimals;

        // collateral amount with l1 decimals
        const collateralAmt = BigNumber.from(loan.collateralAmt)
          .mul(BigNumber.from(10).pow(collateralDecimal))
          .div(BigNumber.from(10).pow(TS_DECIMALS.AMOUNT));

        // debt amount with l1 decimals
        const debtAmt = BigNumber.from(loan.debtAmt)
          .mul(BigNumber.from(10).pow(debtDecimal))
          .div(BigNumber.from(10).pow(TS_DECIMALS.AMOUNT));

        // check event
        await expect(updateLoanTx)
          .to.emit(diamondRollupMock, "UpdateLoan")
          .withArgs(
            loanId,
            BigNumber.from(collateralAmt),
            BigNumber.from(debtAmt)
          );

        // get expected health factor
        const expectedHealthFactor = await getExpectedHealthFactor(
          diamondToken,
          tsbTokenData,
          loan,
          wbtcAnswer,
          ethAnswer,
          LIQUIDATION_FACTOR.ltvThreshold
        );

        // get health factor from zkTrueUp
        const healthFactor = await diamondLoan.getHealthFactor(loanId);

        // compare expected health factor and actual health factor
        expect(healthFactor).to.equal(expectedHealthFactor);
      });
    }

    for (let i = 0; i < stableCoinPairLoanDataJSON.length; i++) {
      it(`Success to get health factor (stable coin pairs loan case ${
        i + 1
      })`, async () => {
        const loanData = stableCoinPairLoanDataJSON[i];
        // tsb USDC
        const tsbTokenData = tsbTokensJSON.filter(
          (token) => token.underlyingTokenId === loanData.debtTokenId
        )[0];
        await createAndWhiteListTsbToken(
          diamondToken,
          diamondTsb,
          operator,
          tsbTokenData
        );

        // USDT decimals = 6
        const decimals = 6;
        // register by USDT
        const registerAmt = utils.parseUnits("1000", decimals);
        // register user2
        await register(
          user2,
          Number(TsTokenId.USDT),
          registerAmt,
          baseTokenAddresses,
          diamondAcc
        );

        // test loan data
        const loan: LoanData = {
          accountId: loanData.accountId,
          tsbTokenId: loanData.tsbTokenId,
          collateralTokenId: loanData.collateralTokenId,
          collateralAmt: BigNumber.from(loanData.collateralAmt),
          debtAmt: BigNumber.from(loanData.debtAmt),
        };

        // update loan
        const updateLoanTx = await diamondRollupMock
          .connect(operator)
          .updateLoanMock(loan);
        await updateLoanTx.wait();

        // get usdc price with 8 decimals from test oracle
        const usdcPriceFeed = priceFeeds[loanData.collateralTokenId];
        const usdcRoundDataJSON = roundDataJSON[loanData.collateralTokenId][0];
        const usdcAnswer = await (
          await updateRoundData(operator, usdcPriceFeed, usdcRoundDataJSON)
        ).answer;

        // get usdt price with 8 decimals from test oracle
        const usdtPriceFeed = priceFeeds[loanData.debtTokenId];
        const usdtRoundDataJSON = roundDataJSON[loanData.debtTokenId][0];
        const usdtAnswer = await (
          await updateRoundData(operator, usdtPriceFeed, usdtRoundDataJSON)
        ).answer;

        // collateral l1 decimals
        const collateralToken = await diamondToken.getAssetConfig(
          loan.collateralTokenId
        );
        const collateralDecimal = collateralToken.decimals;

        // debt token id
        const debtTokenId = tsbTokenData.underlyingTokenId;

        // debt l1 decimals
        const debtToken = await diamondToken.getAssetConfig(debtTokenId);
        const debtDecimal = debtToken.decimals;

        // collateral amount with l1 decimals
        const collateralAmt = BigNumber.from(loan.collateralAmt)
          .mul(BigNumber.from(10).pow(collateralDecimal))
          .div(BigNumber.from(10).pow(TS_DECIMALS.AMOUNT));

        // debt amount with l1 decimals
        const debtAmt = BigNumber.from(loan.debtAmt)
          .mul(BigNumber.from(10).pow(debtDecimal))
          .div(BigNumber.from(10).pow(TS_DECIMALS.AMOUNT));

        // get loan id
        const loanId = await diamondLoan.getLoanId(
          loan.accountId,
          BigNumber.from(tsbTokenData.maturity), // tsbUSDC
          loanData.debtTokenId,
          loan.collateralTokenId
        );

        // check event
        await expect(updateLoanTx)
          .to.emit(diamondRollupMock, "UpdateLoan")
          .withArgs(
            loanId,
            BigNumber.from(collateralAmt),
            BigNumber.from(debtAmt)
          );

        // get expected health factor
        const expectedHealthFactor = await getExpectedHealthFactor(
          diamondToken,
          tsbTokenData,
          loan,
          usdtAnswer,
          usdcAnswer,
          STABLECOIN_PAIR_LIQUIDATION_FACTOR.ltvThreshold
        );

        // get health factor
        const healthFactor = await diamondLoan.getHealthFactor(loanId);

        // compare expected health factor and actual health factor
        expect(healthFactor).to.equal(expectedHealthFactor);
      });
    }
  });
});

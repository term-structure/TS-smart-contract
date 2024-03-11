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
import { BaseTokenAddresses } from "../../../utils/type";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { useFacet } from "../../../utils/useFacet";
import { DEFAULT_ZERO_ADDR } from "../../../utils/config";
import { register } from "../../utils/register";
import { tsbTokensJSON } from "../../data/tsbTokens";
import { baseTokensJSON } from "../../data/baseTokens";
import {
  AccountMock,
  ERC20Mock,
  TokenFacet,
  TsbFacet,
  TsbLib,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  DEFAULT_ETH_ADDRESS,
  TS_BASE_TOKEN,
  TS_DECIMALS,
  TsTokenId,
} from "term-structure-sdk";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { signWithdrawPermit } from "../../utils/permitSignature";
import {
  DELEGATE_REDEEM_MASK,
  DELEGATE_WITHDRAW_MASK,
} from "../../utils/delegate";

//! use AccountMock instead of AccountFacet for testing
export const FACET_NAMES_MOCK = [
  "AccountMock", // replace AccountFacet with AccountMock
  "AddressFacet",
  "FlashLoanFacet",
  "ProtocolParamsFacet",
  "LoanFacet",
  "RollupFacet",
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

describe("Delegate", () => {
  let [user1, user2]: SignerWithAddress[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let operator: Signer;
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let diamondAccMock: AccountMock;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let diamondWithTsbLib: TsbLib;

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
    diamondAccMock = (await useFacet(
      "AccountMock",
      zkTrueUpAddr
    )) as AccountMock;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    diamondWithTsbLib = await ethers.getContractAt("TsbLib", zkTrueUp.address);
  });

  describe("Delegate withdraw", () => {
    it("Success to delegate withdraw base token", async () => {
      // register by ETH
      const registerAmt = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      await register(
        user1,
        Number(TS_BASE_TOKEN.ETH.tokenId),
        registerAmt,
        baseTokenAddresses,
        diamondAccMock
      );

      // user1 delegate to user2
      const delegateTx = await diamondAccMock
        .connect(user1)
        .setDelegatee(user2Addr, DELEGATE_WITHDRAW_MASK);
      await delegateTx.wait();

      // check is delegated
      const isDelegated = await diamondAccMock.getIsDelegated(
        user1Addr,
        user2Addr,
        DELEGATE_WITHDRAW_MASK
      );

      expect(isDelegated).to.be.true;

      const delegatedActions = await diamondAccMock.getDelegatedActions(
        user1Addr,
        user2Addr
      );

      // check delegated action including delegated withdraw
      expect(delegatedActions.and(DELEGATE_WITHDRAW_MASK)).to.be.equal(
        DELEGATE_WITHDRAW_MASK
      );

      // delegatee withdraw tsb token
      const amount = utils.parseEther("1");
      const withdrawTx = await diamondAccMock
        .connect(user2)
        .withdraw(user1Addr, DEFAULT_ETH_ADDRESS, amount); //! ignore _withdraw in AccountMock
      await withdrawTx.wait();
    });

    it("Fail to delegate withdraw base token (ETH case)", async () => {
      // register by ETH
      const registerAmt = utils.parseUnits("10", TS_BASE_TOKEN.ETH.decimals);
      await register(
        user1,
        Number(TS_BASE_TOKEN.ETH.tokenId),
        registerAmt,
        baseTokenAddresses,
        diamondAccMock
      );

      // invalid delegate mask
      const delegateTx = await diamondAccMock
        .connect(user1)
        .setDelegatee(user2Addr, DELEGATE_REDEEM_MASK);
      await delegateTx.wait();

      // check is delegated
      const isDelegated = await diamondAccMock.getIsDelegated(
        user1Addr,
        user2Addr,
        DELEGATE_WITHDRAW_MASK
      );

      expect(isDelegated).to.be.false;

      // delegatee withdraw failed
      const amount = utils.parseEther("1");
      await expect(
        diamondAccMock
          .connect(user2)
          .withdraw(user1Addr, DEFAULT_ETH_ADDRESS, amount)
      ).to.be.revertedWithCustomError(diamondAccMock, "InvalidCaller");
    });

    it("Success to reset delegate", async () => {
      // user1 delegate withdraw operation to user2
      const delegateTx1 = await diamondAccMock
        .connect(user1)
        .setDelegatee(user2Addr, DELEGATE_WITHDRAW_MASK);
      await delegateTx1.wait();

      // check is delegated
      let isDelegated = await diamondAccMock.getIsDelegated(
        user1Addr,
        user2Addr,
        DELEGATE_WITHDRAW_MASK
      );

      expect(isDelegated).to.be.true;

      let delegatedActions = await diamondAccMock.getDelegatedActions(
        user1Addr,
        user2Addr
      );

      const delegatedActionsMask = delegatedActions.or(DELEGATE_REDEEM_MASK);

      // user1 delegate redeem operation to user2
      const delegateTx2 = await diamondAccMock
        .connect(user1)
        .setDelegatee(user2Addr, delegatedActionsMask);
      await delegateTx2.wait();

      // check is delegated
      isDelegated = await diamondAccMock.getIsDelegated(
        user1Addr,
        user2Addr,
        DELEGATE_REDEEM_MASK
      );

      expect(isDelegated).to.be.true;

      delegatedActions = await diamondAccMock.getDelegatedActions(
        user1Addr,
        user2Addr
      );

      // check delegated action including withdraw and redeem
      expect(delegatedActions.and(DELEGATE_WITHDRAW_MASK)).to.be.equal(
        DELEGATE_WITHDRAW_MASK
      );
      expect(delegatedActions.and(DELEGATE_REDEEM_MASK)).to.be.equal(
        DELEGATE_REDEEM_MASK
      );
    });
  });
});

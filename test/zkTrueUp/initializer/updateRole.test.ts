import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../../utils/deployAndInit";
import { useFacet } from "../../../utils/useFacet";
import { toL2Amt } from "../../utils/amountConvertor";
import { DEFAULT_ZERO_ADDR } from "../../../utils/config";
import { register } from "../../utils/register";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { BaseTokenAddresses } from "../../../utils/type";
import { tsbTokensJSON } from "../../data/tsbTokens";
import {
  AccountMock,
  ERC20Mock,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  TsbToken,
  WETH9,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  DEFAULT_ETH_ADDRESS,
  MIN_DEPOSIT_AMOUNT,
  TS_BASE_TOKEN,
  TS_DECIMALS,
  TsTokenId,
} from "term-structure-sdk";

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

describe("Update Roles", function () {
  let [user1, user2]: Signer[] = [];
  let [user1Addr, user2Addr]: string[] = [];
  let weth: WETH9;
  let zkTrueUp: ZkTrueUp;
  let admin: Signer;
  let oriAdmin: Signer;
  let newAdmin: Signer;
  let operator: Signer;
  let diamondAccMock: AccountMock;
  let diamondRollup: RollupFacet;
  let diamondToken: TokenFacet;
  let diamondTsb: TsbFacet;
  let baseTokenAddresses: BaseTokenAddresses;
  let usdt: ERC20Mock;
  const INVALID_TOKEN_ADDRESS = "0x1234567890123456789012345678901234567890";
  const ADMIN_ROLE = utils.keccak256(utils.toUtf8Bytes("ADMIN_ROLE"));
  const OPERATOR_ROLE = utils.keccak256(utils.toUtf8Bytes("OPERATOR_ROLE"));
  const COMMITTER_ROLE = utils.keccak256(utils.toUtf8Bytes("COMMITTER_ROLE"));
  const VERIFIER_ROLE = utils.keccak256(utils.toUtf8Bytes("VERIFIER_ROLE"));
  const EXECUTER_ROLE = utils.keccak256(utils.toUtf8Bytes("EXECUTER_ROLE"));
  // const provider = ethers.providers.getDefaultProvider();
  const provider = new ethers.providers.JsonRpcProvider(
    "http://localhost:8545"
  );

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    [user1, user2] = await ethers.getSigners();
    [user1Addr, user2Addr] = await Promise.all([
      user1.getAddress(),
      user2.getAddress(),
    ]);
    weth = res.weth;
    zkTrueUp = res.zkTrueUp;
    admin = res.admin;
    operator = res.operator;
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAccMock = (await useFacet(
      "AccountMock",
      zkTrueUpAddr
    )) as AccountMock;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    usdt = await ethers.getContractAt(
      "ERC20Mock",
      baseTokenAddresses[TsTokenId.USDT]
    );
  });

  describe("Update Admin", function () {
    it("Success to update admin", async function () {
      newAdmin = await ethers.Wallet.createRandom();
      newAdmin.connect(provider);
      oriAdmin = admin;
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdmin.getAddress())).to.be
        .true;
      await zkTrueUp
        .connect(oriAdmin)
        .grantRole(ADMIN_ROLE, newAdmin.getAddress());
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, newAdmin.getAddress())).to.be
        .true;
      await zkTrueUp
        .connect(oriAdmin)
        .revokeRole(ADMIN_ROLE, oriAdmin.getAddress());
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdmin.getAddress())).to.be
        .false;
    });

    it("Failed to update admin", async function () {
      oriAdmin = admin;
      const notAdmin = await ethers.Wallet.createRandom();
      notAdmin.connect(provider);
      newAdmin = await ethers.Wallet.createRandom();
      newAdmin.connect(provider);
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdmin.getAddress())).to.be
        .true;
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, await notAdmin.getAddress())).to
        .be.false;
      await expect(
        zkTrueUp.connect(notAdmin).grantRole(ADMIN_ROLE, newAdmin.getAddress())
      ).to.be.revertedWith("AccessControl: sender must be an admin to grant");
      await expect(
        zkTrueUp.connect(notAdmin).revokeRole(ADMIN_ROLE, oriAdmin.getAddress())
      ).to.be.revertedWith("AccessControl: sender must be an admin to revoke");
    });
  });
});

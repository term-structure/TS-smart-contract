import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Signer, utils } from "ethers";
import { deployAndInit } from "../../../utils/sepoliaDeployAndInit";
import { useFacet } from "../../../../utils/useFacet";
import { toL2Amt } from "../../../utils/amountConvertor";
import { DEFAULT_ZERO_ADDR } from "../../../../utils/config";
import { register } from "../../../utils/register";
import { whiteListBaseTokens } from "../../../utils/whitelistToken";
import { BaseTokenAddresses } from "../../../../utils/type";
import { tsbTokensJSON } from "../../../data/tsbTokens";
import {
  AccountMock,
  ERC20Mock,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  TsbToken,
  WETH9,
  ZkTrueUp,
} from "../../../../typechain-types";
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
  let zkTrueUp: ZkTrueUp;
  let admin: Signer;
  let operator: Signer;
  const ADMIN_ROLE = utils.keccak256(utils.toUtf8Bytes("ADMIN_ROLE"));
  const OPERATOR_ROLE = utils.keccak256(utils.toUtf8Bytes("OPERATOR_ROLE"));
  const COMMITTER_ROLE = utils.keccak256(utils.toUtf8Bytes("COMMITTER_ROLE"));
  const VERIFIER_ROLE = utils.keccak256(utils.toUtf8Bytes("VERIFIER_ROLE"));
  const EXECUTER_ROLE = utils.keccak256(utils.toUtf8Bytes("EXECUTER_ROLE"));

  beforeEach(async function () {
    const res = await loadFixture(fixture);
    const accounts = await ethers.getSigners();
    user1 = accounts[3];
    user2 = accounts[4];
    zkTrueUp = res.zkTrueUp;
    admin = res.admin;
    operator = res.operator;
  });

  describe("Update admin", function () {
    it("Success to update admin", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = await oriAdmin.getAddress();
      const newAdmin = user1;
      const newAdminAddr = await newAdmin.getAddress();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      await zkTrueUp.connect(oriAdmin).grantRole(ADMIN_ROLE, newAdminAddr);
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, newAdminAddr)).to.be.true;
      await zkTrueUp.connect(oriAdmin).revokeRole(ADMIN_ROLE, oriAdminAddr);
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.false;
    });

    it("Failed to update admin", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const newAdmin = user1;
      const newAdminAddr = (await newAdmin.getAddress()).toLowerCase();
      const notAdmin = user2;
      const notAdminAddr = (await notAdmin.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, notAdminAddr)).to.be.false;
      await expect(
        zkTrueUp.connect(notAdmin).grantRole(ADMIN_ROLE, newAdminAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
      await expect(
        zkTrueUp.connect(notAdmin).revokeRole(ADMIN_ROLE, oriAdminAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("Update operator", function () {
    it("Success to update operator", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const oriOperator = operator;
      const oriOperatorAddr = (await oriOperator.getAddress()).toLowerCase();
      const newOperator = user1;
      const newOperatorAddr = (await newOperator.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(OPERATOR_ROLE, oriOperatorAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(OPERATOR_ROLE, newOperatorAddr)).to.be
        .false;
      await zkTrueUp
        .connect(oriAdmin)
        .grantRole(OPERATOR_ROLE, newOperatorAddr);
      expect(await zkTrueUp.hasRole(OPERATOR_ROLE, newOperatorAddr)).to.be.true;
      await zkTrueUp
        .connect(oriAdmin)
        .revokeRole(OPERATOR_ROLE, oriOperatorAddr);
      expect(await zkTrueUp.hasRole(OPERATOR_ROLE, oriOperatorAddr)).to.be
        .false;
    });

    it("Failed to update operator", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const notAdmin = user2;
      const notAdminAddr = (await notAdmin.getAddress()).toLowerCase();
      const oriOperator = operator;
      const oriOperatorAddr = (await oriOperator.getAddress()).toLowerCase();
      const newOperator = user1;
      const newOperatorAddr = (await newOperator.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, notAdminAddr)).to.be.false;
      expect(await zkTrueUp.hasRole(OPERATOR_ROLE, oriOperatorAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(OPERATOR_ROLE, newOperatorAddr)).to.be
        .false;
      await expect(
        zkTrueUp.connect(notAdmin).grantRole(OPERATOR_ROLE, newOperatorAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
      await expect(
        zkTrueUp.connect(notAdmin).revokeRole(OPERATOR_ROLE, oriOperatorAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("Update committer", function () {
    it("Success to update committer", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const oriCommitter = operator;
      const oriCommitterAddr = (await oriCommitter.getAddress()).toLowerCase();
      const newCommitter = user1;
      const newCommitterAddr = (await newCommitter.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(COMMITTER_ROLE, oriCommitterAddr)).to.be
        .true;
      expect(await zkTrueUp.hasRole(COMMITTER_ROLE, newCommitterAddr)).to.be
        .false;
      await zkTrueUp
        .connect(oriAdmin)
        .grantRole(COMMITTER_ROLE, newCommitterAddr);
      expect(await zkTrueUp.hasRole(COMMITTER_ROLE, newCommitterAddr)).to.be
        .true;
      await zkTrueUp
        .connect(oriAdmin)
        .revokeRole(COMMITTER_ROLE, oriCommitterAddr);
      expect(await zkTrueUp.hasRole(COMMITTER_ROLE, oriCommitterAddr)).to.be
        .false;
    });

    it("Failed to update committer", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const notAdmin = user2;
      const notAdminAddr = (await notAdmin.getAddress()).toLowerCase();
      const oriCommitter = operator;
      const oriCommitterAddr = (await oriCommitter.getAddress()).toLowerCase();
      const newCommitter = user1;
      const newCommitterAddr = (await newCommitter.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, notAdminAddr)).to.be.false;
      expect(await zkTrueUp.hasRole(COMMITTER_ROLE, oriCommitterAddr)).to.be
        .true;
      expect(await zkTrueUp.hasRole(COMMITTER_ROLE, newCommitterAddr)).to.be
        .false;
      await expect(
        zkTrueUp.connect(notAdmin).grantRole(COMMITTER_ROLE, newCommitterAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
      await expect(
        zkTrueUp.connect(notAdmin).revokeRole(COMMITTER_ROLE, oriCommitterAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("Update verifier", function () {
    it("Success to update verifier", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const oriVerifier = operator;
      const oriVerifierAddr = (await oriVerifier.getAddress()).toLowerCase();
      const newVerifier = user1;
      const newVerifierAddr = (await newVerifier.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(VERIFIER_ROLE, oriVerifierAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(VERIFIER_ROLE, newVerifierAddr)).to.be
        .false;
      await zkTrueUp
        .connect(oriAdmin)
        .grantRole(VERIFIER_ROLE, newVerifierAddr);
      expect(await zkTrueUp.hasRole(VERIFIER_ROLE, newVerifierAddr)).to.be.true;
      await zkTrueUp
        .connect(oriAdmin)
        .revokeRole(VERIFIER_ROLE, oriVerifierAddr);
      expect(await zkTrueUp.hasRole(VERIFIER_ROLE, oriVerifierAddr)).to.be
        .false;
    });

    it("Failed to update verifier", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const notAdmin = user2;
      const notAdminAddr = (await notAdmin.getAddress()).toLowerCase();
      const oriVerifier = operator;
      const oriVerifierAddr = (await oriVerifier.getAddress()).toLowerCase();
      const newVerifier = user1;
      const newVerifierAddr = (await newVerifier.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, notAdminAddr)).to.be.false;
      expect(await zkTrueUp.hasRole(VERIFIER_ROLE, oriVerifierAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(VERIFIER_ROLE, newVerifierAddr)).to.be
        .false;
      await expect(
        zkTrueUp.connect(notAdmin).grantRole(VERIFIER_ROLE, newVerifierAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
      await expect(
        zkTrueUp.connect(notAdmin).revokeRole(VERIFIER_ROLE, oriVerifierAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
    });
  });

  describe("Update executer", function () {
    it("Success to update executer", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const oriExecuter = operator;
      const oriExecuterAddr = (await oriExecuter.getAddress()).toLowerCase();
      const newExecuter = user1;
      const newExecuterAddr = (await newExecuter.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(EXECUTER_ROLE, oriExecuterAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(EXECUTER_ROLE, newExecuterAddr)).to.be
        .false;
      await zkTrueUp
        .connect(oriAdmin)
        .grantRole(EXECUTER_ROLE, newExecuterAddr);
      expect(await zkTrueUp.hasRole(EXECUTER_ROLE, newExecuterAddr)).to.be.true;
      await zkTrueUp
        .connect(oriAdmin)
        .revokeRole(EXECUTER_ROLE, oriExecuterAddr);
      expect(await zkTrueUp.hasRole(EXECUTER_ROLE, oriExecuterAddr)).to.be
        .false;
    });

    it("Failed to update executer", async function () {
      const oriAdmin = admin;
      const oriAdminAddr = (await oriAdmin.getAddress()).toLowerCase();
      const notAdmin = user2;
      const notAdminAddr = (await notAdmin.getAddress()).toLowerCase();
      const oriExecuter = operator;
      const oriExecuterAddr = (await oriExecuter.getAddress()).toLowerCase();
      const newExecuter = user1;
      const newExecuterAddr = (await newExecuter.getAddress()).toLowerCase();
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, oriAdminAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(ADMIN_ROLE, notAdminAddr)).to.be.false;
      expect(await zkTrueUp.hasRole(EXECUTER_ROLE, oriExecuterAddr)).to.be.true;
      expect(await zkTrueUp.hasRole(EXECUTER_ROLE, newExecuterAddr)).to.be
        .false;
      await expect(
        zkTrueUp.connect(notAdmin).grantRole(EXECUTER_ROLE, newExecuterAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
      await expect(
        zkTrueUp.connect(notAdmin).revokeRole(EXECUTER_ROLE, oriExecuterAddr)
      ).to.be.revertedWith(
        `AccessControl: account ${notAdminAddr} is missing role ${ADMIN_ROLE}`
      );
    });
  });
});

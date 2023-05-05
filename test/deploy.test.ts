import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { utils, Wallet } from "ethers";
import { diamondCut } from "../utils/diamondCut";
import { diamondInit } from "../utils/diamondInit";
import {
  Governance,
  Governance__factory,
  Loan,
  Loan__factory,
  Token,
  Token__factory,
  ZkTrueUp,
  ZkTrueUp__factory,
  ZkTrueUpInit,
  ZkTrueUpInit__factory,
} from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Deploy", () => {
  let ZkTrueUp: ZkTrueUp__factory;
  let ZkTrueUpInit: ZkTrueUpInit__factory;
  let Governance: Governance__factory;
  let Loan: Loan__factory;
  let Token: Token__factory;
  let zkTrueUp: ZkTrueUp;
  let zkTrueUpInit: ZkTrueUpInit;
  let governance: Governance;
  let loan: Loan;
  let token: Token;
  let deployer: SignerWithAddress;
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let invalidSigner: SignerWithAddress;
  let treasury: Wallet;
  let insurance: Wallet;
  let vault: Wallet;

  beforeEach(async function () {
    [deployer, admin, operator, invalidSigner] = await ethers.getSigners();
    // deploy governance facet
    Governance = await ethers.getContractFactory("Governance");
    governance = await Governance.connect(deployer).deploy();
    await governance.deployed();

    // deploy loan facet
    Loan = await ethers.getContractFactory("Loan");
    loan = await Loan.connect(deployer).deploy();
    await loan.deployed();

    // deploy token facet
    Token = await ethers.getContractFactory("Token");
    token = await Token.connect(deployer).deploy();
    await token.deployed();

    // deploy init facet
    ZkTrueUpInit = await ethers.getContractFactory("ZkTrueUpInit");
    ZkTrueUpInit.connect(deployer);
    zkTrueUpInit = await ZkTrueUpInit.deploy();
    await zkTrueUpInit.deployed();

    // deploy diamond contract
    ZkTrueUp = await ethers.getContractFactory("ZkTrueUp");
    zkTrueUp = await ZkTrueUp.connect(deployer).deploy();
    await zkTrueUp.deployed();

    treasury = ethers.Wallet.createRandom();
    insurance = ethers.Wallet.createRandom();
    vault = ethers.Wallet.createRandom();
  });
  it("Success to deploy", async function () {
    // governance diamond cut
    const registeredGovFnSelectors = await diamondCut(
      deployer,
      zkTrueUp,
      governance.address,
      Governance
    );

    // loan diamond cut
    const registeredLoanFnSelectors = await diamondCut(
      deployer,
      zkTrueUp,
      loan.address,
      Loan
    );

    const registeredTokenFnSelectors = await diamondCut(
      deployer,
      zkTrueUp,
      token.address,
      Token
    );

    const diamondZkTrueUp = await ethers.getContractAt(
      "ZkTrueUp",
      zkTrueUp.address
    );

    // check that governance function selectors are registered
    expect(
      await diamondZkTrueUp.facetFunctionSelectors(governance.address)
    ).have.members(registeredGovFnSelectors);
    // check that registerSelectors are registered to governance
    for (let i = 0; i < registeredGovFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUp.facetAddress(registeredGovFnSelectors[i])
      ).to.equal(governance.address);
    }

    // check that loan function selectors are registered
    expect(
      await diamondZkTrueUp.facetFunctionSelectors(loan.address)
    ).have.members(registeredLoanFnSelectors);
    // check that registerSelectors are registered to loan
    for (let i = 0; i < registeredLoanFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUp.facetAddress(registeredLoanFnSelectors[i])
      ).to.equal(loan.address);
    }

    // check that token function selectors are registered
    expect(
      await diamondZkTrueUp.facetFunctionSelectors(token.address)
    ).have.members(registeredTokenFnSelectors);
    // check that registerSelectors are registered to token
    for (let i = 0; i < registeredTokenFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUp.facetAddress(registeredTokenFnSelectors[i])
      ).to.equal(token.address);
    }

    const initData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "address", "address", "address"],
      [
        admin.address,
        operator.address,
        treasury.address,
        insurance.address,
        vault.address,
      ]
    );

    // init diamond cut
    await diamondInit(
      deployer,
      zkTrueUp,
      zkTrueUpInit.address,
      ZkTrueUpInit,
      initData
    );

    // check initFacet is one-time use and have not be added
    expect(
      await diamondZkTrueUp.facetFunctionSelectors(zkTrueUpInit.address)
    ).to.have.lengthOf(0);

    // check governance facet init
    const diamondGov = await ethers.getContractAt(
      "Governance",
      zkTrueUp.address
    );
    expect(
      await diamondGov.hasRole(utils.id("ADMIN_ROLE"), admin.address)
    ).to.equal(true);
    expect(
      await diamondGov.hasRole(utils.id("OPERATOR_ROLE"), operator.address)
    ).to.equal(true);
    expect(await diamondGov.getTreasuryAddr()).to.equal(treasury.address);
    expect(await diamondGov.getInsuranceAddr()).to.equal(insurance.address);
    expect(await diamondGov.getVaultAddr()).to.equal(vault.address);

    // check loan facet init
    const diamondLoan = await ethers.getContractAt("Loan", zkTrueUp.address);
    expect(await diamondLoan.getHalfLiquidationThreshold()).to.equal(10000);
    expect(await diamondLoan.getFlashLoanPremium()).to.equal(3);

    // check token facet init
    const diamondToken = await ethers.getContractAt("Token", zkTrueUp.address);
    expect(await diamondToken.getTokenNum()).to.equal(0);
  });

  it("Failed to deploy, invalid diamond cut signer", async function () {
    // fail to diamond cut with invalid owner
    await expect(
      diamondCut(invalidSigner, zkTrueUp, governance.address, Governance)
    ).to.be.revertedWithCustomError(ZkTrueUp, "Ownable__NotOwner");
  });

  it("Failed to deploy, invalid diamond init signer", async function () {
    // governance diamond cut
    await diamondCut(deployer, zkTrueUp, governance.address, Governance);

    // diamond init
    const ZkTrueUpInit = await ethers.getContractFactory("ZkTrueUpInit");
    ZkTrueUpInit.connect(deployer);
    const zkTrueUpInit = await ZkTrueUpInit.deploy();
    await zkTrueUpInit.deployed();

    const initData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "address", "address", "address"],
      [
        admin.address,
        operator.address,
        treasury.address,
        insurance.address,
        vault.address,
      ]
    );

    // invalid diamond init signer
    await expect(
      diamondInit(
        invalidSigner,
        zkTrueUp,
        zkTrueUpInit.address,
        ZkTrueUpInit,
        initData
      )
    ).to.be.revertedWithCustomError(ZkTrueUp, "Ownable__NotOwner");
  });
});

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
  ZkTrueUpInit,
  ZkTrueUpInit__factory,
  ZkTrueUpMock,
  ZkTrueUpMock__factory,
} from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { getSlotNum, getStorageAt } from "../utils/slotHelper";

describe("Deploy", () => {
  let ZkTrueUpMock: ZkTrueUpMock__factory;
  let ZkTrueUpInit: ZkTrueUpInit__factory;
  let Governance: Governance__factory;
  let Loan: Loan__factory;
  let Token: Token__factory;
  let zkTrueUpMock: ZkTrueUpMock;
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
    ZkTrueUpMock = await ethers.getContractFactory("ZkTrueUpMock");
    zkTrueUpMock = await ZkTrueUpMock.connect(deployer).deploy();
    await zkTrueUpMock.deployed();

    treasury = ethers.Wallet.createRandom();
    insurance = ethers.Wallet.createRandom();
    vault = ethers.Wallet.createRandom();
  });
  it("Success to deploy", async function () {
    // governance diamond cut
    const registeredGovFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      governance.address,
      Governance
    );

    // loan diamond cut
    const registeredLoanFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      loan.address,
      Loan
    );

    const registeredTokenFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      token.address,
      Token
    );

    const diamondZkTrueUpMock = await ethers.getContractAt(
      "ZkTrueUpMock",
      zkTrueUpMock.address
    );

    // check that governance function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(governance.address)
    ).have.members(registeredGovFnSelectors);
    // check that registerSelectors are registered to governance
    for (let i = 0; i < registeredGovFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredGovFnSelectors[i])
      ).to.equal(governance.address);
    }

    // check that loan function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(loan.address)
    ).have.members(registeredLoanFnSelectors);
    // check that registerSelectors are registered to loan
    for (let i = 0; i < registeredLoanFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredLoanFnSelectors[i])
      ).to.equal(loan.address);
    }

    // check that token function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(token.address)
    ).have.members(registeredTokenFnSelectors);
    // check that registerSelectors are registered to token
    for (let i = 0; i < registeredTokenFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredTokenFnSelectors[i])
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
      zkTrueUpMock,
      zkTrueUpInit.address,
      ZkTrueUpInit,
      initData
    );

    const GovernanceStorageSlot = getSlotNum(
      "zkTureUp.contracts.storage.Governance"
    );

    // get address from storage slot
    const treasuryAddr = utils.getAddress(
      utils.hexlify(await getStorageAt(zkTrueUpMock, GovernanceStorageSlot))
    );
    const insuranceAddr = utils.getAddress(
      utils.hexlify(
        await getStorageAt(zkTrueUpMock, GovernanceStorageSlot.add(1))
      )
    );
    const vaultAddr = utils.getAddress(
      utils.hexlify(
        await getStorageAt(zkTrueUpMock, GovernanceStorageSlot.add(2))
      )
    );

    // check initFacet is one-time use and have not be added
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(zkTrueUpInit.address)
    ).to.have.lengthOf(0);
    expect(
      await diamondZkTrueUpMock.hasRole(utils.id("ADMIN_ROLE"), admin.address)
    ).to.equal(true);
    expect(
      await diamondZkTrueUpMock.hasRole(
        utils.id("OPERATOR_ROLE"),
        operator.address
      )
    ).to.equal(true);

    // check governance facet init
    const diamondGov = await ethers.getContractAt(
      "Governance",
      zkTrueUpMock.address
    );

    expect(await diamondGov.getTreasuryAddr())
      .to.equal(treasury.address)
      .to.equal(treasuryAddr);
    expect(await diamondGov.getInsuranceAddr())
      .to.equal(insurance.address)
      .to.equal(insuranceAddr);
    expect(await diamondGov.getVaultAddr())
      .to.equal(vault.address)
      .to.equal(vaultAddr);

    // check loan facet init
    const diamondLoan = await ethers.getContractAt(
      "Loan",
      zkTrueUpMock.address
    );
    expect(await diamondLoan.getHalfLiquidationThreshold()).to.equal(10000);
    expect(await diamondLoan.getFlashLoanPremium()).to.equal(3);

    // check token facet init
    const diamondToken = await ethers.getContractAt(
      "Token",
      zkTrueUpMock.address
    );
    expect(await diamondToken.getTokenNum()).to.equal(0);
  });

  it("Failed to deploy, invalid diamond cut signer", async function () {
    // fail to diamond cut with invalid owner
    await expect(
      diamondCut(invalidSigner, zkTrueUpMock, governance.address, Governance)
    ).to.be.revertedWithCustomError(ZkTrueUpMock, "Ownable__NotOwner");
  });

  it("Failed to deploy, invalid diamond init signer", async function () {
    // governance diamond cut
    await diamondCut(deployer, zkTrueUpMock, governance.address, Governance);

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
        zkTrueUpMock,
        zkTrueUpInit.address,
        ZkTrueUpInit,
        initData
      )
    ).to.be.revertedWithCustomError(ZkTrueUpMock, "Ownable__NotOwner");
  });
});

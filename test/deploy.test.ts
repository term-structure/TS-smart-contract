import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory, utils, Wallet } from "ethers";
import { diamondCut } from "../utils/diamondCut";
import { diamondInit } from "../utils/diamondInit";
import {
  AccountFacet,
  AccountFacet__factory,
  EvacuVerifier,
  EvacuVerifier__factory,
  FlashLoanFacet,
  FlashLoanFacet__factory,
  GovernanceFacet,
  GovernanceFacet__factory,
  LoanFacet,
  LoanFacet__factory,
  RollupFacet,
  RollupFacet__factory,
  TokenFacet,
  TokenFacet__factory,
  TsbFacet,
  TsbFacet__factory,
  Verifier,
  Verifier__factory,
  WETH9,
  WETH9__factory,
  ZkTrueUpInit,
  ZkTrueUpInit__factory,
  ZkTrueUpMock,
  ZkTrueUpMock__factory,
} from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { getSlotNum, getStorageAt } from "../utils/slotHelper";
import { deployLibs } from "../utils/deployLibs";
import { ETH_ASSET_CONFIG, GENESIS_STATE_ROOT } from "../utils/config";

const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;

enum libEnum {
  AccountLib,
  AddressLib,
  FlashLoanLib,
  GovernanceLib,
  LoanLib,
  RollupLib,
  TokenLib,
  TsbLib,
}

const contractLibs = [
  "AccountLib",
  "AddressLib",
  "FlashLoanLib",
  "GovernanceLib",
  "LoanLib",
  "RollupLib",
  "TokenLib",
  "TsbLib",
];

describe("Deploy", () => {
  let WETH: WETH9__factory;
  let PoseidonFactory: ContractFactory;
  let Verifier: Verifier__factory;
  let EvacuVerifier: EvacuVerifier__factory;
  let weth: WETH9;
  let poseidonUnit2Contract: Contract;
  let verifier: Verifier;
  let evacuVerifier: EvacuVerifier;
  let ZkTrueUpMock: ZkTrueUpMock__factory;
  let ZkTrueUpInit: ZkTrueUpInit__factory;
  let AccountFacet: AccountFacet__factory;
  let FlashLoanFacet: FlashLoanFacet__factory;
  let GovernanceFacet: GovernanceFacet__factory;
  let LoanFacet: LoanFacet__factory;
  let RollupFacet: RollupFacet__factory;
  let TokenFacet: TokenFacet__factory;
  let TsbFacet: TsbFacet__factory;
  let zkTrueUpMock: ZkTrueUpMock;
  let zkTrueUpInit: ZkTrueUpInit;
  let accountFacet: AccountFacet;
  let flashLoanFacet: FlashLoanFacet;
  let governanceFacet: GovernanceFacet;
  let loanFacet: LoanFacet;
  let rollupFacet: RollupFacet;
  let tokenFacet: TokenFacet;
  let tsbFacet: TsbFacet;
  let deployer: SignerWithAddress;
  let admin: SignerWithAddress;
  let operator: SignerWithAddress;
  let invalidSigner: SignerWithAddress;
  let treasury: Wallet;
  let insurance: Wallet;
  let vault: Wallet;

  beforeEach(async function () {
    [deployer, admin, operator, invalidSigner] = await ethers.getSigners();

    // deploy libs
    const libs = await deployLibs(contractLibs, deployer);

    // deploy weth
    WETH = await ethers.getContractFactory("WETH9");
    weth = await WETH.connect(deployer).deploy();
    await weth.deployed();

    // deploy poseidonUnit2
    PoseidonFactory = new ethers.ContractFactory(
      generateABI(2),
      createCode(2),
      operator
    );
    poseidonUnit2Contract = await PoseidonFactory.deploy();
    await poseidonUnit2Contract.deployed();

    // deploy verifier
    Verifier = await ethers.getContractFactory("Verifier");
    verifier = await Verifier.connect(deployer).deploy();
    await verifier.deployed();

    // deploy evacuVerifier
    EvacuVerifier = await ethers.getContractFactory("EvacuVerifier");
    evacuVerifier = await EvacuVerifier.connect(deployer).deploy();
    await evacuVerifier.deployed();

    // deploy account facet
    AccountFacet = await ethers.getContractFactory("AccountFacet");
    accountFacet = await AccountFacet.connect(deployer).deploy();
    await accountFacet.deployed();

    // deploy flash loan facet
    FlashLoanFacet = await ethers.getContractFactory("FlashLoanFacet", {
      libraries: {
        GovernanceLib: libs[libEnum.GovernanceLib].address,
      },
    });
    flashLoanFacet = await FlashLoanFacet.connect(deployer).deploy();
    await flashLoanFacet.deployed();

    // deploy governance facet
    GovernanceFacet = await ethers.getContractFactory("GovernanceFacet", {
      libraries: {
        GovernanceLib: libs[libEnum.GovernanceLib].address,
      },
    });
    governanceFacet = await GovernanceFacet.connect(deployer).deploy();
    await governanceFacet.deployed();

    // deploy loan facet
    LoanFacet = await ethers.getContractFactory("LoanFacet", {
      libraries: {
        GovernanceLib: libs[libEnum.GovernanceLib].address,
      },
    });
    loanFacet = await LoanFacet.connect(deployer).deploy();
    await loanFacet.deployed();

    // deploy rollup facet
    RollupFacet = await ethers.getContractFactory("RollupFacet", {
      libraries: {
        GovernanceLib: libs[libEnum.GovernanceLib].address,
      },
    });
    rollupFacet = await RollupFacet.connect(deployer).deploy();
    await rollupFacet.deployed();

    // deploy token facet
    TokenFacet = await ethers.getContractFactory("TokenFacet");
    tokenFacet = await TokenFacet.connect(deployer).deploy();
    await tokenFacet.deployed();

    // deploy tsb facet
    TsbFacet = await ethers.getContractFactory("TsbFacet");
    tsbFacet = await TsbFacet.connect(deployer).deploy();
    await tsbFacet.deployed();

    // deploy diamond contract
    ZkTrueUpMock = await ethers.getContractFactory("ZkTrueUpMock");
    zkTrueUpMock = await ZkTrueUpMock.connect(deployer).deploy();
    await zkTrueUpMock.deployed();

    // deploy init facet
    ZkTrueUpInit = await ethers.getContractFactory("ZkTrueUpInit");
    ZkTrueUpInit.connect(deployer);
    zkTrueUpInit = await ZkTrueUpInit.deploy();
    await zkTrueUpInit.deployed();

    treasury = ethers.Wallet.createRandom();
    insurance = ethers.Wallet.createRandom();
    vault = ethers.Wallet.createRandom();
  });
  it("Success to deploy", async function () {
    const diamondZkTrueUpMock = await ethers.getContractAt(
      "ZkTrueUpMock",
      zkTrueUpMock.address
    );

    // account diamond cut
    const registeredAccFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      accountFacet.address,
      AccountFacet
    );

    // check that account function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(accountFacet.address)
    ).have.members(registeredAccFnSelectors);
    // check that registerSelectors are registered to account
    for (let i = 0; i < registeredAccFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredAccFnSelectors[i])
      ).to.equal(accountFacet.address);
    }

    // flash loan diamond cut
    const registeredFlashLoanFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      flashLoanFacet.address,
      FlashLoanFacet
    );

    // check that flash loan function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(flashLoanFacet.address)
    ).have.members(registeredFlashLoanFnSelectors);
    // check that registerSelectors are registered to flash loan
    for (let i = 0; i < registeredFlashLoanFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(
          registeredFlashLoanFnSelectors[i]
        )
      ).to.equal(flashLoanFacet.address);
    }

    // governance diamond cut
    const registeredGovFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      governanceFacet.address,
      GovernanceFacet
    );

    // check that governance function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(governanceFacet.address)
    ).have.members(registeredGovFnSelectors);
    // check that registerSelectors are registered to governance
    for (let i = 0; i < registeredGovFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredGovFnSelectors[i])
      ).to.equal(governanceFacet.address);
    }

    // loan diamond cut
    const registeredLoanFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      loanFacet.address,
      LoanFacet
    );

    // check that loan function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(loanFacet.address)
    ).have.members(registeredLoanFnSelectors);
    // check that registerSelectors are registered to loan
    for (let i = 0; i < registeredLoanFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredLoanFnSelectors[i])
      ).to.equal(loanFacet.address);
    }

    // rollup diamond cut
    const registeredRollupFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      rollupFacet.address,
      RollupFacet
    );

    // check that rollup function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(rollupFacet.address)
    ).have.members(registeredRollupFnSelectors);
    // check that registerSelectors are registered to rollup
    for (let i = 0; i < registeredRollupFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredRollupFnSelectors[i])
      ).to.equal(rollupFacet.address);
    }

    // token diamond cut
    const registeredTokenFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      tokenFacet.address,
      TokenFacet
    );

    // check that token function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(tokenFacet.address)
    ).have.members(registeredTokenFnSelectors);
    // check that registerSelectors are registered to token
    for (let i = 0; i < registeredTokenFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredTokenFnSelectors[i])
      ).to.equal(tokenFacet.address);
    }

    // tsb diamond cut
    const registeredTsbFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      tsbFacet.address,
      TsbFacet
    );

    // check that token function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(tsbFacet.address)
    ).have.members(registeredTsbFnSelectors);
    // check that registerSelectors are registered to token
    for (let i = 0; i < registeredTsbFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredTsbFnSelectors[i])
      ).to.equal(tsbFacet.address);
    }

    const initData = ethers.utils.defaultAbiCoder.encode(
      [
        "address",
        "address",
        "address",
        "address",
        "address",
        "address",
        "address",
        "address",
        "address",
        "bytes32",
        "tuple(bool isStableCoin,bool isTsbToken,uint8 decimals,uint256 minDepositAmt,address tokenAddr,address priceFeed)",
      ],
      [
        weth.address,
        poseidonUnit2Contract.address,
        verifier.address,
        evacuVerifier.address,
        admin.address,
        operator.address,
        treasury.address,
        insurance.address,
        vault.address,
        GENESIS_STATE_ROOT,
        {
          isStableCoin: ETH_ASSET_CONFIG.isStableCoin,
          isTsbToken: ETH_ASSET_CONFIG.isTsbToken,
          decimals: ETH_ASSET_CONFIG.decimals,
          minDepositAmt: ETH_ASSET_CONFIG.minDepositAmt,
          tokenAddr: ETH_ASSET_CONFIG.tokenAddr,
          priceFeed: ETH_ASSET_CONFIG.priceFeed,
        },
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

    // check role init
    expect(
      await diamondZkTrueUpMock.hasRole(utils.id("ADMIN_ROLE"), admin.address)
    ).to.equal(true);
    expect(
      await diamondZkTrueUpMock.hasRole(
        utils.id("OPERATOR_ROLE"),
        operator.address
      )
    ).to.equal(true);
    expect(
      await diamondZkTrueUpMock.hasRole(
        utils.id("COMMITTER_ROLE"),
        operator.address
      )
    ).to.equal(true);
    expect(
      await diamondZkTrueUpMock.hasRole(
        utils.id("VERIFIER_ROLE"),
        operator.address
      )
    ).to.equal(true);
    expect(
      await diamondZkTrueUpMock.hasRole(
        utils.id("EXECUTER_ROLE"),
        operator.address
      )
    ).to.equal(true);

    // check account facet init
    const diamondAcc = await ethers.getContractAt(
      "AccountFacet",
      zkTrueUpMock.address
    );

    expect(await diamondAcc.getAccountNum()).to.equal(1);

    // check governance facet init
    const diamondGov = await ethers.getContractAt(
      "GovernanceFacet",
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
      "LoanFacet",
      zkTrueUpMock.address
    );
    expect(await diamondLoan.getHalfLiquidationThreshold()).to.equal(10000);

    // check token facet init
    const diamondToken = await ethers.getContractAt(
      "TokenFacet",
      zkTrueUpMock.address
    );
    expect(await diamondToken.getTokenNum()).to.equal(0);

    const setVaultAddrTx = await diamondGov
      .connect(admin)
      .setVaultAddr(admin.address);

    await setVaultAddrTx.wait();
  });

  it("Failed to deploy, invalid diamond cut signer", async function () {
    // fail to diamond cut with invalid owner
    await expect(
      diamondCut(
        invalidSigner,
        zkTrueUpMock,
        governanceFacet.address,
        GovernanceFacet
      )
    ).to.be.revertedWithCustomError(ZkTrueUpMock, "Ownable__NotOwner");
  });

  it("Failed to deploy, invalid diamond init signer", async function () {
    // governance diamond cut
    await diamondCut(
      deployer,
      zkTrueUpMock,
      governanceFacet.address,
      GovernanceFacet
    );

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

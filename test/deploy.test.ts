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
import {
  ETH_ASSET_CONFIG,
  FACET_NAMES,
  DEFAULT_GENESIS_STATE_ROOT,
} from "../utils/config";
import { deployFacets } from "../utils/deployFacets";
import { AddressFacet__factory } from "../typechain-types/factories/contracts/address";
import { AddressFacet } from "../typechain-types/contracts/address";
import { keccak256 } from "ethers/lib/utils";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";
import { useFacet } from "../utils/useFacet";
const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;

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
  let AddressFacet: AddressFacet__factory;
  let FlashLoanFacet: FlashLoanFacet__factory;
  let GovernanceFacet: GovernanceFacet__factory;
  let LoanFacet: LoanFacet__factory;
  let RollupFacet: RollupFacet__factory;
  let TokenFacet: TokenFacet__factory;
  let TsbFacet: TsbFacet__factory;
  let zkTrueUpMock: ZkTrueUpMock;
  let zkTrueUpInit: ZkTrueUpInit;
  let accountFacet: AccountFacet;
  let addressFacet: AddressFacet;
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
    const { facetFactories, facets } = await deployFacets(
      FACET_NAMES,
      deployer
    );
    AccountFacet = facetFactories["AccountFacet"] as AccountFacet__factory;
    accountFacet = facets["AccountFacet"] as AccountFacet;
    AddressFacet = facetFactories["AddressFacet"] as AddressFacet__factory;
    addressFacet = facets["AddressFacet"] as AddressFacet;
    FlashLoanFacet = facetFactories[
      "FlashLoanFacet"
    ] as FlashLoanFacet__factory;
    flashLoanFacet = facets["FlashLoanFacet"] as FlashLoanFacet;
    GovernanceFacet = facetFactories[
      "GovernanceFacet"
    ] as GovernanceFacet__factory;
    governanceFacet = facets["GovernanceFacet"] as GovernanceFacet;
    LoanFacet = facetFactories["LoanFacet"] as LoanFacet__factory;
    loanFacet = facets["LoanFacet"] as LoanFacet;
    RollupFacet = facetFactories["RollupFacet"] as RollupFacet__factory;
    rollupFacet = facets["RollupFacet"] as RollupFacet;
    TokenFacet = facetFactories["TokenFacet"] as TokenFacet__factory;
    tokenFacet = facets["TokenFacet"] as TokenFacet;
    TsbFacet = facetFactories["TsbFacet"] as TsbFacet__factory;
    tsbFacet = facets["TsbFacet"] as TsbFacet;

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

    // deploy diamond contract
    ZkTrueUpMock = await ethers.getContractFactory("ZkTrueUpMock");
    zkTrueUpMock = await ZkTrueUpMock.connect(deployer).deploy();
    await zkTrueUpMock.deployed();

    // deploy diamond init contract
    ZkTrueUpInit = await ethers.getContractFactory("ZkTrueUpInit");
    zkTrueUpInit = await ZkTrueUpInit.connect(deployer).deploy();
    await zkTrueUpInit.deployed();

    treasury = ethers.Wallet.createRandom();
    insurance = ethers.Wallet.createRandom();
    vault = ethers.Wallet.createRandom();
  });
  it("Success to deploy", async function () {
    const diamondZkTrueUpMock = await useFacet("ZkTrueUpMock", zkTrueUpMock);

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

    // address diamond cut
    const registeredAddrFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      addressFacet.address,
      AddressFacet
    );

    // check that address function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(addressFacet.address)
    ).have.members(registeredAddrFnSelectors);
    // check that registerSelectors are registered to address
    for (let i = 0; i < registeredAddrFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredAddrFnSelectors[i])
      ).to.equal(addressFacet.address);
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
        DEFAULT_GENESIS_STATE_ROOT,
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
    const diamondAcc = await useFacet("AccountFacet", zkTrueUpMock);

    expect(await diamondAcc.getAccountNum()).to.equal(1);

    // check address facet init
    const diamondAddr = await useFacet("AddressFacet", zkTrueUpMock);

    expect(await diamondAddr.getWETHAddr()).to.equal(weth.address);
    expect(await diamondAddr.getPoseidonUnit2Addr()).to.equal(
      poseidonUnit2Contract.address
    );
    expect(await diamondAddr.getVerifierAddr()).to.equal(verifier.address);
    expect(await diamondAddr.getEvacuVerifierAddr()).to.equal(
      evacuVerifier.address
    );

    // check flashLoan facet init
    const diamondFlashLoan = await useFacet("FlashLoanFacet", zkTrueUpMock);

    expect(await diamondFlashLoan.getFlashLoanPremium()).to.equal(3);

    // check governance facet init
    const diamondGov = await useFacet("GovernanceFacet", zkTrueUpMock);

    expect(await diamondGov.getTreasuryAddr())
      .to.equal(treasury.address)
      .to.equal(treasuryAddr);
    expect(await diamondGov.getInsuranceAddr())
      .to.equal(insurance.address)
      .to.equal(insuranceAddr);
    expect(await diamondGov.getVaultAddr())
      .to.equal(vault.address)
      .to.equal(vaultAddr);
    expect((await diamondGov.getFundWeight()).treasury).to.equal(5000);
    expect((await diamondGov.getFundWeight()).insurance).to.equal(1000);
    expect((await diamondGov.getFundWeight()).vault).to.equal(4000);

    // check loan facet init
    const diamondLoan = await useFacet("LoanFacet", zkTrueUpMock);

    expect(await diamondLoan.getHalfLiquidationThreshold()).to.equal(10000);
    const liquidationFactor = await diamondLoan.getLiquidationFactor(false);
    expect(liquidationFactor.ltvThreshold).to.equal(800);
    expect(liquidationFactor.liquidatorIncentive).to.equal(50);
    expect(liquidationFactor.protocolPenalty).to.equal(50);
    const stableCoinPairLiquidationFactor =
      await diamondLoan.getLiquidationFactor(true);
    expect(stableCoinPairLiquidationFactor.ltvThreshold).to.equal(925);
    expect(stableCoinPairLiquidationFactor.liquidatorIncentive).to.equal(30);
    expect(stableCoinPairLiquidationFactor.protocolPenalty).to.equal(15);

    // check rollup facet init
    const diamondRollup = await useFacet("RollupFacet", zkTrueUpMock);

    const genesisBlockHash = keccak256(
      utils.defaultAbiCoder.encode(
        ["uint32", "uint64", "bytes32", "bytes32", "bytes32", "uint256"],
        [
          0,
          0,
          "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
          utils.hexZeroPad(ethers.utils.hexlify(0), 32),
          DEFAULT_GENESIS_STATE_ROOT,
          0,
        ]
      )
    );
    expect(await diamondRollup.getStoredBlockHash(0)).to.equal(
      genesisBlockHash
    );

    // check token facet init
    const diamondToken = await useFacet("TokenFacet", zkTrueUpMock);

    expect(await diamondToken.getTokenNum()).to.equal(1);
    expect(await diamondToken.getTokenId(DEFAULT_ETH_ADDRESS)).to.equal(1);
    const ethAssetConfig = await diamondToken.getAssetConfig(1);
    expect(ethAssetConfig.isStableCoin).to.equal(ETH_ASSET_CONFIG.isStableCoin);
    expect(ethAssetConfig.isTsbToken).to.equal(ETH_ASSET_CONFIG.isTsbToken);
    expect(ethAssetConfig.decimals).to.equal(ETH_ASSET_CONFIG.decimals);
    expect(ethAssetConfig.minDepositAmt).to.equal(
      ETH_ASSET_CONFIG.minDepositAmt
    );
    expect(ethAssetConfig.tokenAddr).to.equal(ETH_ASSET_CONFIG.tokenAddr);
    expect(ethAssetConfig.priceFeed).to.equal(ETH_ASSET_CONFIG.priceFeed);
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
        DEFAULT_GENESIS_STATE_ROOT,
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

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, ContractFactory, utils, Wallet } from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { facetAdd } from "../../../utils/facetAdd";
import { facetInit } from "../../../utils/facetInit";
import { deployFacets } from "../../../utils/deployFacets";
import { AddressFacet__factory } from "../../../typechain-types/factories/contracts/zkTrueUp/address";
import { AddressFacet } from "../../../typechain-types/contracts/zkTrueUp/address";
import { keccak256 } from "ethers/lib/utils";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";
import { useFacet } from "../../../utils/useFacet";
import initStates from "../../data/rollupData/zkTrueUp-8-10-8-6-3-3-31/initStates.json";
import {
  AccountFacet,
  AccountFacet__factory,
  EvacuVerifier,
  EvacuVerifier__factory,
  FlashLoanFacet,
  FlashLoanFacet__factory,
  ProtocolParamsFacet,
  ProtocolParamsFacet__factory,
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
} from "../../../typechain-types";
import {
  ETH_ASSET_CONFIG,
  FACET_NAMES,
  DEFAULT_GENESIS_STATE_ROOT,
  INIT_FUNCTION_NAME,
} from "../../../utils/config";
const genesisStateRoot = initStates.stateRoot;
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
  let ProtocolParamsFacet: ProtocolParamsFacet__factory;
  let LoanFacet: LoanFacet__factory;
  let RollupFacet: RollupFacet__factory;
  let TokenFacet: TokenFacet__factory;
  let TsbFacet: TsbFacet__factory;
  let zkTrueUpMock: ZkTrueUpMock;
  let zkTrueUpInit: ZkTrueUpInit;
  let accountFacet: AccountFacet;
  let addressFacet: AddressFacet;
  let flashLoanFacet: FlashLoanFacet;
  let protocolParamsFacet: ProtocolParamsFacet;
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
    ProtocolParamsFacet = facetFactories[
      "ProtocolParamsFacet"
    ] as ProtocolParamsFacet__factory;
    protocolParamsFacet = facets["ProtocolParamsFacet"] as ProtocolParamsFacet;
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
      deployer
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

  it("Failed to deploy, invalid diamond cut signer", async function () {
    // fail to diamond cut with invalid owner, only deployer can call diamond cut
    await expect(
      facetAdd(
        invalidSigner,
        zkTrueUpMock,
        protocolParamsFacet.address,
        ProtocolParamsFacet
      )
    ).to.be.revertedWithCustomError(ZkTrueUpMock, "Ownable__NotOwner");
  });

  it("Failed to deploy, invalid diamond init signer", async function () {
    // protocolParams diamond cut
    await facetAdd(
      deployer,
      zkTrueUpMock,
      protocolParamsFacet.address,
      ProtocolParamsFacet
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
        genesisStateRoot ?? DEFAULT_GENESIS_STATE_ROOT,
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

    // invalid diamond init signer, only deployer can call diamond init
    const onlyCall = true;
    await expect(
      facetInit(
        invalidSigner,
        zkTrueUpMock,
        zkTrueUpInit.address,
        ZkTrueUpInit,
        INIT_FUNCTION_NAME,
        initData,
        onlyCall
      )
    ).to.be.revertedWithCustomError(ZkTrueUpMock, "Ownable__NotOwner");
  });

  it("Success to deploy", async function () {
    const zkTrueUpMockAddr = zkTrueUpMock.address;
    const diamondZkTrueUpMock = (await useFacet(
      "ZkTrueUpMock",
      zkTrueUpMockAddr
    )) as ZkTrueUpMock;

    // account diamond cut
    const registeredAccFnSelectors = await facetAdd(
      deployer,
      zkTrueUpMock,
      accountFacet.address,
      AccountFacet
    );
    // check that account facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(accountFacet.address)
    ).have.members(registeredAccFnSelectors);
    // check that registerSelectors are registered to account facet address
    for (let i = 0; i < registeredAccFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredAccFnSelectors[i])
      ).to.equal(accountFacet.address);
    }

    // address diamond cut
    const registeredAddrFnSelectors = await facetAdd(
      deployer,
      zkTrueUpMock,
      addressFacet.address,
      AddressFacet
    );

    // check that address facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(addressFacet.address)
    ).have.members(registeredAddrFnSelectors);
    // check that registerSelectors are registered to address facet address
    for (let i = 0; i < registeredAddrFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredAddrFnSelectors[i])
      ).to.equal(addressFacet.address);
    }

    // flashLoan facet diamond cut
    const registeredFlashLoanFnSelectors = await facetAdd(
      deployer,
      zkTrueUpMock,
      flashLoanFacet.address,
      FlashLoanFacet
    );

    // check that flashLoan facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(flashLoanFacet.address)
    ).have.members(registeredFlashLoanFnSelectors);
    // check that registerSelectors are registered to flashLoan facet address
    for (let i = 0; i < registeredFlashLoanFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(
          registeredFlashLoanFnSelectors[i]
        )
      ).to.equal(flashLoanFacet.address);
    }

    // protocolParams diamond cut
    const registeredGovFnSelectors = await facetAdd(
      deployer,
      zkTrueUpMock,
      protocolParamsFacet.address,
      ProtocolParamsFacet
    );

    // check that protocolParams facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(
        protocolParamsFacet.address
      )
    ).have.members(registeredGovFnSelectors);
    // check that registerSelectors are registered to protocolParams facet address
    for (let i = 0; i < registeredGovFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredGovFnSelectors[i])
      ).to.equal(protocolParamsFacet.address);
    }

    // loan diamond cut
    const registeredLoanFnSelectors = await facetAdd(
      deployer,
      zkTrueUpMock,
      loanFacet.address,
      LoanFacet
    );

    // check that loan facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(loanFacet.address)
    ).have.members(registeredLoanFnSelectors);
    // check that registerSelectors are registered to loan facet address
    for (let i = 0; i < registeredLoanFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredLoanFnSelectors[i])
      ).to.equal(loanFacet.address);
    }

    // rollup diamond cut
    const registeredRollupFnSelectors = await facetAdd(
      deployer,
      zkTrueUpMock,
      rollupFacet.address,
      RollupFacet
    );

    // check that rollup facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(rollupFacet.address)
    ).have.members(registeredRollupFnSelectors);
    // check that registerSelectors are registered to rollup facet address
    for (let i = 0; i < registeredRollupFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredRollupFnSelectors[i])
      ).to.equal(rollupFacet.address);
    }

    // token diamond cut
    const registeredTokenFnSelectors = await facetAdd(
      deployer,
      zkTrueUpMock,
      tokenFacet.address,
      TokenFacet
    );

    // check that token facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(tokenFacet.address)
    ).have.members(registeredTokenFnSelectors);
    // check that registerSelectors are registered to token facet address
    for (let i = 0; i < registeredTokenFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredTokenFnSelectors[i])
      ).to.equal(tokenFacet.address);
    }

    // tsb diamond cut
    const registeredTsbFnSelectors = await facetAdd(
      deployer,
      zkTrueUpMock,
      tsbFacet.address,
      TsbFacet
    );

    // check that tsb facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(tsbFacet.address)
    ).have.members(registeredTsbFnSelectors);
    // check that registerSelectors are registered to tsb facet address
    for (let i = 0; i < registeredTsbFnSelectors.length; i++) {
      expect(
        await diamondZkTrueUpMock.facetAddress(registeredTsbFnSelectors[i])
      ).to.equal(tsbFacet.address);
    }

    const initData = utils.defaultAbiCoder.encode(
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
        genesisStateRoot ?? DEFAULT_GENESIS_STATE_ROOT,
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

    // init diamond cut to initialize the diamond
    const onlyCall = true;
    await facetInit(
      deployer,
      zkTrueUpMock,
      zkTrueUpInit.address,
      ZkTrueUpInit,
      INIT_FUNCTION_NAME,
      initData,
      onlyCall
    );

    // check initFacet is one-time use and have not be added
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(zkTrueUpInit.address)
    ).to.have.lengthOf(0);

    // check role init
    expect(await diamondZkTrueUpMock.owner()).to.equal(admin.address);
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
    const diamondAcc = await useFacet("AccountFacet", zkTrueUpMockAddr);

    expect(await diamondAcc.getAccountNum()).to.equal(1);

    // check address facet init
    const diamondAddr = await useFacet("AddressFacet", zkTrueUpMockAddr);

    expect(await diamondAddr.getWETHAddr()).to.equal(weth.address);
    expect(await diamondAddr.getPoseidonUnit2Addr()).to.equal(
      poseidonUnit2Contract.address
    );
    expect(await diamondAddr.getVerifierAddr()).to.equal(verifier.address);
    expect(await diamondAddr.getEvacuVerifierAddr()).to.equal(
      evacuVerifier.address
    );

    // check flashLoan facet init
    const diamondFlashLoan = await useFacet("FlashLoanFacet", zkTrueUpMockAddr);

    expect(await diamondFlashLoan.getFlashLoanPremium()).to.equal(3);

    // check protocolParams facet init
    const diamondProtocolParams = await useFacet(
      "ProtocolParamsFacet",
      zkTrueUpMockAddr
    );

    expect(await diamondProtocolParams.getTreasuryAddr()).to.equal(
      treasury.address
    );
    expect(await diamondProtocolParams.getInsuranceAddr()).to.equal(
      insurance.address
    );
    expect(await diamondProtocolParams.getVaultAddr()).to.equal(vault.address);
    expect((await diamondProtocolParams.getFundWeight()).treasury).to.equal(
      5000
    );
    expect((await diamondProtocolParams.getFundWeight()).insurance).to.equal(
      1000
    );
    expect((await diamondProtocolParams.getFundWeight()).vault).to.equal(4000);

    // check loan facet init
    const diamondLoan = await useFacet("LoanFacet", zkTrueUpMockAddr);

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
    const diamondRollup = await useFacet("RollupFacet", zkTrueUpMockAddr);
    // calculate genesis block hash
    const genesisBlockHash = keccak256(
      utils.defaultAbiCoder.encode(
        ["uint32", "uint64", "bytes32", "bytes32", "bytes32", "uint256"],
        [
          0,
          0,
          "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
          utils.hexZeroPad(utils.hexlify(0), 32),
          genesisStateRoot ?? DEFAULT_GENESIS_STATE_ROOT,
          0,
        ]
      )
    );
    expect(await diamondRollup.getStoredBlockHash(0)).to.equal(
      genesisBlockHash
    );

    // check token facet init
    const diamondToken = await useFacet("TokenFacet", zkTrueUpMockAddr);

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
});

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, ContractFactory, utils, Wallet } from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { diamondCut } from "../../utils/diamondCut";
import { diamondInit } from "../../utils/diamondInit";
import { deployFacets } from "../../utils/deployFacets";
import { AddressFacet__factory } from "../../typechain-types/factories/contracts/zkTrueUp/address";
import { AddressFacet } from "../../typechain-types/contracts/zkTrueUp/address";
import { keccak256 } from "ethers/lib/utils";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";
import { useFacet } from "../../utils/useFacet";
import initStates from "../data/rollupData/zkTrueUp-8-10-8-6-3-3-31/initStates.json";
import {
  getMappingSlotNum,
  getSlotNum,
  getStorageAt,
} from "../../utils/slotHelper";
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
} from "../../typechain-types";
import {
  ETH_ASSET_CONFIG,
  FACET_NAMES,
  DEFAULT_GENESIS_STATE_ROOT,
} from "../../utils/config";
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

  it("Success to deploy", async function () {
    const diamondZkTrueUpMock = (await useFacet(
      "ZkTrueUpMock",
      zkTrueUpMock
    )) as ZkTrueUpMock;

    // account diamond cut
    const registeredAccFnSelectors = await diamondCut(
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
    const registeredAddrFnSelectors = await diamondCut(
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
    const registeredFlashLoanFnSelectors = await diamondCut(
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

    // governance diamond cut
    const registeredGovFnSelectors = await diamondCut(
      deployer,
      zkTrueUpMock,
      governanceFacet.address,
      GovernanceFacet
    );

    // check that governance facet function selectors are registered
    expect(
      await diamondZkTrueUpMock.facetFunctionSelectors(governanceFacet.address)
    ).have.members(registeredGovFnSelectors);
    // check that registerSelectors are registered to governance facet address
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
    const registeredRollupFnSelectors = await diamondCut(
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
    const registeredTokenFnSelectors = await diamondCut(
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
    const registeredTsbFnSelectors = await diamondCut(
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

    // init diamond cut to initialize the diamond
    await diamondInit(
      deployer,
      zkTrueUpMock,
      zkTrueUpInit.address,
      ZkTrueUpInit,
      initData
    );

    // check storage slot location is correct
    const accountStorageSlot = getSlotNum("zkTrueUp.contracts.storage.Account");
    const addressStorageSlot = getSlotNum("zkTrueUp.contracts.storage.Address");
    const flashLoanStorageSlot = getSlotNum(
      "zkTrueUp.contracts.storage.FlashLoan"
    );
    const governanceStorageSlot = getSlotNum(
      "zkTrueUp.contracts.storage.Governance"
    );
    const loanStorageSlot = getSlotNum("zkTrueUp.contracts.storage.Loan");
    const rollupStorageSlot = getSlotNum("zkTrueUp.contracts.storage.Rollup");
    const tokenStorageSlot = getSlotNum("zkTrueUp.contracts.storage.Token");

    // get value by storage slot number from zkTrueUpMock test contract
    // check all values are set to correct storage slot location
    // check account storage slot value after init
    const accountNum = await getStorageAt(zkTrueUpMock, accountStorageSlot);
    expect(accountNum).to.equal(1);

    // check address storage slot value after init
    const wethAddr = utils.getAddress(
      utils.hexlify(await getStorageAt(zkTrueUpMock, addressStorageSlot))
    );
    const poseidonUnit2Addr = utils.getAddress(
      utils.hexlify(await getStorageAt(zkTrueUpMock, addressStorageSlot.add(1)))
    );
    const verifierAddr = utils.getAddress(
      utils.hexlify(await getStorageAt(zkTrueUpMock, addressStorageSlot.add(2)))
    );
    const evacuVerifierAddr = utils.getAddress(
      utils.hexlify(await getStorageAt(zkTrueUpMock, addressStorageSlot.add(3)))
    );
    expect(wethAddr).to.equal(weth.address);
    expect(poseidonUnit2Addr).to.equal(poseidonUnit2Contract.address);
    expect(verifierAddr).to.equal(verifier.address);
    expect(evacuVerifierAddr).to.equal(evacuVerifier.address);

    // check flashLoan storage slot value after init
    const flashLoanPremium = await getStorageAt(
      zkTrueUpMock,
      flashLoanStorageSlot
    );
    expect(flashLoanPremium).to.equal(3);

    // check governance storage slot value after init
    const treasuryAddr = utils.getAddress(
      utils.hexlify(await getStorageAt(zkTrueUpMock, governanceStorageSlot))
    );
    const insuranceAddr = utils.getAddress(
      utils.hexlify(
        await getStorageAt(zkTrueUpMock, governanceStorageSlot.add(1))
      )
    );
    const vaultAddr = utils.getAddress(
      utils.hexlify(
        await getStorageAt(zkTrueUpMock, governanceStorageSlot.add(2))
      )
    );
    expect(treasuryAddr).to.equal(treasury.address);
    expect(insuranceAddr).to.equal(insurance.address);
    expect(vaultAddr).to.equal(vault.address);

    // check loan storage slot value after init
    const halfLiquidationThreshold = await getStorageAt(
      zkTrueUpMock,
      loanStorageSlot
    );
    expect(halfLiquidationThreshold).to.equal(10000);

    // check rollup storage slot value after init
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
    const genesisBlockHashSlotNum = getMappingSlotNum(
      utils.hexlify(0), // key = 0
      utils.hexlify(rollupStorageSlot.add(4)) // the 4th slot in rollup storage struct
    );
    const genesisStateRootSlot = await getStorageAt(
      zkTrueUpMock,
      BigNumber.from(genesisBlockHashSlotNum)
    );
    expect(genesisStateRootSlot).to.equal(genesisBlockHash);

    // check token storage slot value after init
    const tokenNum = await getStorageAt(zkTrueUpMock, tokenStorageSlot);
    expect(tokenNum).to.equal(1);
    const ethTokenIdSlotNum = getMappingSlotNum(
      DEFAULT_ETH_ADDRESS, // key = DEFAULT_ETH_ADDRESS
      utils.hexlify(tokenStorageSlot.add(1)) // the 1st slot in token storage struct
    );
    const ethTokenId = await getStorageAt(
      zkTrueUpMock,
      BigNumber.from(ethTokenIdSlotNum)
    );
    expect(ethTokenId).to.equal(1);

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

    expect(await diamondGov.getTreasuryAddr()).to.equal(treasury.address);
    expect(await diamondGov.getInsuranceAddr()).to.equal(insurance.address);
    expect(await diamondGov.getVaultAddr()).to.equal(vault.address);
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
});

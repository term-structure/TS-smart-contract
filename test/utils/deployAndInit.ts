import { ethers } from "hardhat";
import { deployFacets } from "../../utils/deployFacets";
import { cutFacets } from "../../utils/cutFacets";
import { BaseTokenAddr, FacetInfo, PriceFeed } from "../../utils/type";
import { diamondInit } from "../../utils/diamondInit";
import {
  BASE_TOKEN_ASSET_CONFIG,
  ETH_ASSET_CONFIG,
  GENESIS_STATE_ROOT,
  facetNames,
} from "../../utils/config";
import { ERC20Mock, OracleMock } from "../../typechain-types";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";
const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;

export const deployAndInit = async () => {
  const [deployer, admin, operator] = await ethers.getSigners();
  const treasury = ethers.Wallet.createRandom();
  const insurance = ethers.Wallet.createRandom();
  const vault = ethers.Wallet.createRandom();
  const baseTokenAddresses: BaseTokenAddr = {};
  const priceFeeds: PriceFeed = {};
  const { facetFactories, facets } = await deployFacets(facetNames, deployer);

  // set test oracle price feed
  const OracleMock = await ethers.getContractFactory("OracleMock");
  OracleMock.connect(operator);
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  ERC20Mock.connect(operator);

  for (let i = 0; i < BASE_TOKEN_ASSET_CONFIG.length; i++) {
    const token = BASE_TOKEN_ASSET_CONFIG[i];
    const oracleMock = (await OracleMock.deploy()) as OracleMock;
    await oracleMock.deployed();
    priceFeeds[token.tokenId] = oracleMock.address;

    if (token.symbol == "ETH") {
      baseTokenAddresses[token.tokenId] = DEFAULT_ETH_ADDRESS;
    } else {
      const testERC20 = (await ERC20Mock.deploy(
        token.name,
        token.symbol,
        token.decimals
      )) as ERC20Mock;
      await testERC20.deployed();
      baseTokenAddresses[token.tokenId] = testERC20.address;
    }
  }

  // deploy weth
  const WETH = await ethers.getContractFactory("WETH9");
  const weth = await WETH.connect(deployer).deploy();
  await weth.deployed();

  // deploy poseidonUnit2
  const PoseidonFactory = new ethers.ContractFactory(
    generateABI(2),
    createCode(2),
    operator
  );
  const poseidonUnit2Contract = await PoseidonFactory.deploy();
  await poseidonUnit2Contract.deployed();

  // deploy verifier
  const Verifier = await ethers.getContractFactory("Verifier");
  const verifier = await Verifier.connect(deployer).deploy();
  await verifier.deployed();

  // deploy evacuVerifier
  const EvacuVerifier = await ethers.getContractFactory("EvacuVerifier");
  const evacuVerifier = await EvacuVerifier.connect(deployer).deploy();
  await evacuVerifier.deployed();

  // deploy diamond contract
  const ZkTrueUp = await ethers.getContractFactory("ZkTrueUp");
  const zkTrueUp = await ZkTrueUp.connect(deployer).deploy();
  await zkTrueUp.deployed();

  // deploy diamond init contract
  const ZkTrueUpInit = await ethers.getContractFactory("ZkTrueUpInit");
  const zkTrueUpInit = await ZkTrueUpInit.connect(deployer).deploy();
  await zkTrueUpInit.deployed();

  const facetInfos: FacetInfo[] = Object.keys(facets).map((facetName) => {
    console.log("facetName: ", facetName);
    return {
      facetName: facetName,
      facetAddress: facets[facetName].address,
      facetFactory: facetFactories[facetName],
    };
  });

  const fnSelectors = cutFacets(deployer, zkTrueUp, facetInfos);
  console.log("fnSelectors: ", fnSelectors);

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
    zkTrueUp,
    zkTrueUpInit.address,
    ZkTrueUpInit,
    initData
  );

  return {
    deployer,
    admin,
    operator,
    treasury,
    insurance,
    vault,
    weth,
    poseidonUnit2Contract,
    verifier,
    evacuVerifier,
    zkTrueUp,
    zkTrueUpInit,
    facetFactories,
    facets,
    fnSelectors,
    baseTokenAddresses,
    priceFeeds,
  };
};

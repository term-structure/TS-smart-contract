import { ethers } from "hardhat";
import { deployFacets } from "../../utils/deploy/deployFacets";
import { cutFacets } from "../../utils/cutFacets";
import { BaseTokenAddresses, FacetInfo, PriceFeeds } from "../../utils/type";
import {
  BASE_TOKEN_ASSET_CONFIG,
  ETH_ASSET_CONFIG,
  FACET_NAMES,
  DEFAULT_GENESIS_STATE_ROOT,
  INIT_FUNCTION_NAME,
  MAINNET_ADDRESS,
} from "../../utils/config";
import { ERC20Mock, OracleMock, WETH9 } from "../../typechain-types";
import { DEFAULT_ETH_ADDRESS, TsTokenId } from "term-structure-sdk";
import initStates from "../data/rollupData/zkTrueUp-8-10-8-6-3-3-32/initStates.json";
import { utils } from "ethers";
import { safeInitFacet } from "diamond-engraver";
const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;
const genesisStateRoot = initStates.stateRoot;

export const deployAndInit = async (
  facetNames?: string[],
  isMainnetForkTesting?: boolean
) => {
  const [deployer, admin, operator] = await ethers.getSigners();
  const provider = ethers.provider;
  const treasury = ethers.Wallet.createRandom();
  const insurance = ethers.Wallet.createRandom();
  const vault = ethers.Wallet.createRandom();
  const baseTokenAddresses: BaseTokenAddresses = {};
  const priceFeeds: PriceFeeds = {};
  const { facetFactories, facets } = await deployFacets(
    facetNames ?? FACET_NAMES,
    deployer
  );

  if (isMainnetForkTesting) {
    baseTokenAddresses[1] = DEFAULT_ETH_ADDRESS;
    baseTokenAddresses[2] = MAINNET_ADDRESS.WBTC;
    baseTokenAddresses[3] = MAINNET_ADDRESS.USDT;
    baseTokenAddresses[4] = MAINNET_ADDRESS.USDC;
    baseTokenAddresses[5] = MAINNET_ADDRESS.DAI;
    priceFeeds[1] = MAINNET_ADDRESS.ETH_PRICE_FEED;
    priceFeeds[2] = MAINNET_ADDRESS.WBTC_PRICE_FEED;
    priceFeeds[3] = MAINNET_ADDRESS.USDT_PRICE_FEED;
    priceFeeds[4] = MAINNET_ADDRESS.USDC_PRICE_FEED;
    priceFeeds[5] = MAINNET_ADDRESS.DAI_PRICE_FEED;
  } else {
    // set test oracle price feed
    const OracleMock = await ethers.getContractFactory("OracleMock");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");

    for (let i = 0; i < BASE_TOKEN_ASSET_CONFIG.length; i++) {
      const token = BASE_TOKEN_ASSET_CONFIG[i];
      const oracleMock = (await OracleMock.connect(
        operator
      ).deploy()) as OracleMock;
      await oracleMock.deployed();
      priceFeeds[token.tokenId] = oracleMock.address;

      if (token.symbol == "ETH") {
        baseTokenAddresses[token.tokenId] = DEFAULT_ETH_ADDRESS;
      } else {
        const erc20Mock = (await ERC20Mock.connect(operator).deploy(
          token.name,
          token.symbol,
          token.decimals
        )) as ERC20Mock;
        await erc20Mock.deployed();
        baseTokenAddresses[token.tokenId] = erc20Mock.address;
      }
    }
  }

  let weth: WETH9;
  if (isMainnetForkTesting) {
    weth = await ethers.getContractAt("WETH9", MAINNET_ADDRESS.WETH);
  } else {
    // deploy weth
    const WETH = await ethers.getContractFactory("WETH9");
    weth = await WETH.connect(deployer).deploy();
    await weth.deployed();
  }

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
    // console.log("facetName: ", facetName);
    return {
      facetName: facetName,
      facetAddress: facets[facetName].address,
      facetFactory: facetFactories[facetName],
    };
  });

  const fnSelectors = await cutFacets(deployer, provider, zkTrueUp, facetInfos);
  // console.log("fnSelectors: ", fnSelectors);

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
      isMainnetForkTesting ? MAINNET_ADDRESS.WETH : weth.address,
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
        priceFeed: priceFeeds[TsTokenId.ETH],
      },
    ]
  );

  // init diamond cut
  const onlyCall = true;
  await safeInitFacet(
    deployer,
    provider,
    zkTrueUp,
    zkTrueUpInit.address,
    ZkTrueUpInit,
    INIT_FUNCTION_NAME,
    initData,
    onlyCall
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
    facets, // facet contracts
    fnSelectors,
    baseTokenAddresses,
    priceFeeds,
  };
};

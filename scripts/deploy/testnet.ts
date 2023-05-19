import { Wallet, utils } from "ethers";
import { ethers } from "hardhat";
import { deployBaseTokens } from "../utils/deployBaseTokens";
import { deployFacets } from "../../utils/deployFacets";
import { FacetInfo, getString } from "../../utils/type";
import { cutFacets } from "../../utils/cutFacets";
import { diamondInit } from "../../utils/diamondInit";
import { TsTokenId } from "term-structure-sdk";
import {
  BASE_TOKEN_ASSET_CONFIG,
  DEFAULT_GENESIS_STATE_ROOT,
  ETH_ASSET_CONFIG,
  FACET_NAMES,
} from "../../utils/config";
const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.GOERLI_RPC_URL
  );

  const operatorAddr = getString(process.env.GOERLI_OPERATOR_ADDRESS);
  const deployerPrivKey = getString(process.env.GOERLI_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);
  const adminAddr = getString(process.env.GOERLI_ADMIN_ADDRESS);
  const treasuryAddr = getString(process.env.GOERLI_TREASURY_ADDRESS);
  const insuranceAddr = getString(process.env.GOERLI_INSURANCE_ADDRESS);
  const vaultAddr = getString(process.env.GOERLI_VAULT_ADDRESS);

  console.log(
    "Deploying contracts with deployer:",
    await deployer.getAddress()
  );

  // Deploy base tokens for test
  console.log("Deploying base tokens...");
  const { baseTokenAddresses, priceFeeds } = await deployBaseTokens(
    deployer,
    BASE_TOKEN_ASSET_CONFIG
  );
  for (const token of BASE_TOKEN_ASSET_CONFIG) {
    console.log(
      `Deployed ${token.symbol} at ${baseTokenAddresses[token.tokenId]}`,
      `with price feed ${priceFeeds[token.tokenId]}`
    );
  }

  // Deploy WETH
  console.log("Deploying WETH...");
  const WETH = await ethers.getContractFactory("WETH9");
  const weth = await WETH.connect(deployer).deploy();
  await weth.deployed();
  console.log("WETH deployed to:", weth.address);

  // deploy poseidonUnit2
  console.log("Deploying PoseidonUnit2...");
  const PoseidonFactory = new ethers.ContractFactory(
    generateABI(2),
    createCode(2),
    deployer
  );
  const poseidonUnit2Contract = await PoseidonFactory.deploy();
  await poseidonUnit2Contract.deployed();
  console.log("poseidonUnit2 deployed to:", poseidonUnit2Contract.address);

  // deploy verifier
  console.log("Deploying Verifier...");
  const Verifier = await ethers.getContractFactory("Verifier");
  const verifier = await Verifier.connect(deployer).deploy();
  await verifier.deployed();
  console.log("Verifier deployed to:", verifier.address);

  // deploy evacuVerifier
  console.log("Deploying EvacuVerifier...");
  const EvacuVerifier = await ethers.getContractFactory("EvacuVerifier");
  const evacuVerifier = await EvacuVerifier.connect(deployer).deploy();
  await evacuVerifier.deployed();
  console.log("EvacuVerifier deployed to:", evacuVerifier.address);

  // deploy facet contracts
  console.log("Deploying facets...");
  const { facetFactories, facets } = await deployFacets(FACET_NAMES, deployer);
  for (const facetName of Object.keys(facets)) {
    console.log(`${facetName} deployed to: ${facets[facetName].address}`);
  }

  // deploy diamond contract
  console.log("Deploying ZkTrueUp...");
  const ZkTrueUp = await ethers.getContractFactory("ZkTrueUp");
  const zkTrueUp = await ZkTrueUp.connect(deployer).deploy();
  await zkTrueUp.deployed();
  console.log("ZkTrueUp deployed to:", zkTrueUp.address);

  // deploy diamond init contract
  console.log("Deploying ZkTrueUpInit...");
  const ZkTrueUpInit = await ethers.getContractFactory("ZkTrueUpInit");
  const zkTrueUpInit = await ZkTrueUpInit.connect(deployer).deploy();
  await zkTrueUpInit.deployed();
  console.log("ZkTrueUpInit deployed to:", zkTrueUpInit.address);

  // cut facets
  console.log("Cutting facets...");
  const facetInfos: FacetInfo[] = Object.keys(facets).map((facetName) => {
    // console.log("facetName: ", facetName);
    return {
      facetName: facetName,
      facetAddress: facets[facetName].address,
      facetFactory: facetFactories[facetName],
    };
  });

  const fnSelectors = await cutFacets(deployer, zkTrueUp, facetInfos);
  console.log("Facets cut");

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
      adminAddr,
      operatorAddr,
      treasuryAddr,
      insuranceAddr,
      vaultAddr,
      DEFAULT_GENESIS_STATE_ROOT,
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
  console.log("Init diamond cut...");
  await diamondInit(
    deployer,
    zkTrueUp,
    zkTrueUpInit.address,
    ZkTrueUpInit,
    initData
  );
  console.log("Diamond initialized");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { Wallet, utils } from "ethers";
import { ethers } from "hardhat";
import { deployBaseTokens } from "../utils/deployBaseTokens";
import { deployFacets } from "../../utils/deployFacets";
import { FacetInfo } from "../../utils/type";
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
    process.env.DEVNET_RPC_URL || "http://localhost:8545"
  );

  const node = utils.HDNode.fromMnemonic(
    process.env.DEVNET_MNEMONIC ||
      "test test test test test test test test test test test junk"
  );

  const wallets = [];
  for (let i = 0; i < 1000; i++) {
    // eslint-disable-next-line quotes
    const path = "m/44'/60'/0'/0/" + i;
    const wallet = node.derivePath(path);
    wallets.push(wallet);
  }

  const operatorAddr =
    process.env.DEVNET_OPERATOR_ADDRESS || wallets[3].address;

  const deployerPrivKey =
    process.env.DEVNET_DEPLOYER_PRIVATE_KEY || wallets[4].privateKey;
  const deployer = new Wallet(deployerPrivKey, provider);

  const adminAddr = process.env.DEVNET_ADMIN_ADDRESS || wallets[5].address;
  const treasuryAddr =
    process.env.DEVNET_TREASURY_ADDRESS || wallets[6].address;
  const insuranceAddr =
    process.env.DEVNET_INSURANCE_ADDRESS || wallets[7].address;
  const vaultAddr = process.env.DEVNET_VAULT_ADDRESS || wallets[8].address;

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

  // Deploy WETH
  console.log("Deploying WETH...");
  const WETH = await ethers.getContractFactory("WETH9");
  const weth = await WETH.connect(deployer).deploy();
  await weth.deployed();

  // deploy poseidonUnit2
  console.log("Deploying PoseidonUnit2...");
  const PoseidonFactory = new ethers.ContractFactory(
    generateABI(2),
    createCode(2),
    deployer
  );
  const poseidonUnit2Contract = await PoseidonFactory.deploy();
  await poseidonUnit2Contract.deployed();

  // deploy verifier
  console.log("Deploying Verifier...");
  const Verifier = await ethers.getContractFactory("Verifier");
  const verifier = await Verifier.connect(deployer).deploy();
  await verifier.deployed();

  // deploy evacuVerifier
  console.log("Deploying EvacuVerifier...");
  const EvacuVerifier = await ethers.getContractFactory("EvacuVerifier");
  const evacuVerifier = await EvacuVerifier.connect(deployer).deploy();
  await evacuVerifier.deployed();

  // deploy facet contracts
  console.log("Deploying facets...");
  const { facetFactories, facets } = await deployFacets(FACET_NAMES, deployer);

  // deploy diamond contract
  console.log("Deploying ZkTrueUp...");
  const ZkTrueUp = await ethers.getContractFactory("ZkTrueUp");
  const zkTrueUp = await ZkTrueUp.connect(deployer).deploy();
  await zkTrueUp.deployed();

  // deploy diamond init contract
  console.log("Deploying ZkTrueUpInit...");
  const ZkTrueUpInit = await ethers.getContractFactory("ZkTrueUpInit");
  const zkTrueUpInit = await ZkTrueUpInit.connect(deployer).deploy();
  await zkTrueUpInit.deployed();

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
  console.log("Completed cutting facets.");

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
  console.log("Diamond initialized successfully 💎💎💎");

  // log addresses
  for (const token of BASE_TOKEN_ASSET_CONFIG) {
    console.log(
      `${token.symbol} address: ${baseTokenAddresses[token.tokenId]}`,
      `with price feed ${priceFeeds[token.tokenId]}`
    );
  }
  console.log("WETH address:", weth.address);
  console.log("PoseidonUnit2 address:", poseidonUnit2Contract.address);
  console.log("Verifier address:", verifier.address);
  console.log("EvacuVerifier address:", evacuVerifier.address);
  for (const facetName of Object.keys(facets)) {
    console.log(`${facetName} address: ${facets[facetName].address}`);
  }
  console.log("ZkTrueUp address:", zkTrueUp.address);
  console.log("ZkTrueUpInit address:", zkTrueUpInit.address);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { Wallet, utils } from "ethers";
import { ethers } from "hardhat";
import { deployFacets } from "../../utils/deploy/deployFacets";
import { FacetInfo, getString } from "../../utils/type";
import { cutFacets } from "../../utils/cutFacets";
import {
  ETH_ASSET_CONFIG,
  FACET_NAMES,
  INIT_FUNCTION_NAME,
} from "../../utils/config";
import { safeInitFacet } from "diamond-engraver";
import { AssetConfigStruct } from "../../typechain-types/contracts/zkTrueUp/token/ITokenFacet";
const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.MAINNET_RPC_URL
  );

  const operatorAddr = getString(process.env.MAINNET_OPERATOR_ADDRESS);
  const deployerPrivKey = getString(process.env.MAINNET_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);
  const adminAddr = getString(process.env.MAINNET_ADMIN_ADDRESS);
  const treasuryAddr = getString(process.env.MAINNET_TREASURY_ADDRESS);
  const insuranceAddr = getString(process.env.MAINNET_INSURANCE_ADDRESS);
  const vaultAddr = getString(process.env.MAINNET_VAULT_ADDRESS);
  const genesisStateRoot = getString(process.env.MAINNET_GENESIS_STATE_ROOT);

  console.log(
    "Deploying contracts with deployer:",
    await deployer.getAddress()
  );

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

  const fnSelectors = await cutFacets(deployer, provider, zkTrueUp, facetInfos);
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
      "tuple(bool isStableCoin,bool isTsbToken,uint8 decimals,uint256 minDepositAmt,address token,address priceFeed)",
    ],
    [
      process.env.MAINNET_WETH_ADDRESS,
      poseidonUnit2Contract.address,
      verifier.address,
      evacuVerifier.address,
      adminAddr,
      operatorAddr,
      treasuryAddr,
      insuranceAddr,
      vaultAddr,
      genesisStateRoot,
      {
        isStableCoin: ETH_ASSET_CONFIG.isStableCoin,
        isTsbToken: ETH_ASSET_CONFIG.isTsbToken,
        decimals: ETH_ASSET_CONFIG.decimals,
        minDepositAmt: ETH_ASSET_CONFIG.minDepositAmt,
        token: ETH_ASSET_CONFIG.tokenAddr,
        priceFeed: process.env.MAINNET_ETH_PRICE_FEED_ADDRESS,
      } as AssetConfigStruct,
    ]
  );

  // init diamond cut
  console.log("Init diamond cut...");
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
  console.log("Diamond initialized successfully 💎💎💎");

  // log addresses
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

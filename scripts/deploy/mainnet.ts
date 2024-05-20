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
import {
  getCurrentBranch,
  getLatestCommit,
  createDirectoryIfNotExists,
} from "../../utils/deployHelper";
import * as fs from "fs";

const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.MAINNET_RPC_URL
  );

  const operatorAddr = getString(process.env.MAINNET_OPERATOR_ADDRESS);
  const governorAddr = getString(process.env.MAINNET_GOVERNOR_ADDRESS);
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

  console.log("Genesis state root: ", genesisStateRoot);

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
    console.log("facetName: ", facetName);
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
      //! use deployer address as the admin for now, will be changed to multisig later
      // adminAddr,
      deployer.address,
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

  // change operator role from operator to governor
  const OPERATOR_ROLE = ethers.utils.id("OPERATOR_ROLE");
  let tx = await zkTrueUp
    .connect(deployer)
    .grantRole(OPERATOR_ROLE, governorAddr);
  await tx.wait();
  tx = await zkTrueUp.connect(deployer).revokeRole(OPERATOR_ROLE, operatorAddr);
  await tx.wait();

  // change admin role from deployer to admin
  const ADMIN_ROLE = ethers.utils.id("ADMIN_ROLE");
  tx = await zkTrueUp.connect(deployer).grantRole(ADMIN_ROLE, adminAddr);
  await tx.wait();
  tx = await zkTrueUp
    .connect(deployer)
    .revokeRole(ADMIN_ROLE, deployer.address);
  await tx.wait();

  console.log("Diamond initialized successfully 💎💎💎");

  const creationTx = await zkTrueUp.provider.getTransactionReceipt(
    zkTrueUp.deployTransaction.hash
  );

  const result: { [key: string]: unknown } = {};
  result["current_branch"] = getCurrentBranch();
  result["latest_commit"] = getLatestCommit();
  result["genesis_state_root"] = genesisStateRoot;
  result["deployer"] = deployer.address;
  result["operator"] = operatorAddr;
  result["governor"] = governorAddr;
  result["admin"] = adminAddr;
  result["treasury"] = treasuryAddr;
  result["insurance"] = insuranceAddr;
  result["vault"] = vaultAddr;
  result["poseidon_unit_2"] = poseidonUnit2Contract.address;
  result["verifier"] = verifier.address;
  result["evacu_verifier"] = evacuVerifier.address;
  for (const facetName of Object.keys(facets)) {
    result[facetName] = facets[facetName].address;
  }
  result["weth"] = process.env.MAINNET_WETH_ADDRESS;
  result["zk_true_up_init"] = zkTrueUpInit.address;
  result["zk_true_up"] = zkTrueUp.address;
  result["creation_block_number"] = creationTx.blockNumber.toString();

  await createDirectoryIfNotExists("tmp");
  const jsonString = JSON.stringify(result, null, 2);
  const currentDate = new Date();
  const year = currentDate.getFullYear().toString();
  const month = (currentDate.getMonth() + 1).toString().padStart(2, "0"); // Month is 0-indexed, add 1 to it, pad with zero if needed
  const day = currentDate.getDate().toString().padStart(2, "0"); // Pad the day with zero if needed
  const dateString = `${year}${month}${day}`;
  const outFile = `tmp/deploy_mainnet_${dateString}.json`;
  fs.writeFile(outFile, jsonString, "utf8", (err: unknown) => {
    if (err) {
      console.error("An error occurred:", err);
    } else {
      console.log(`JSON saved to ${outFile}`);
    }
  });

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

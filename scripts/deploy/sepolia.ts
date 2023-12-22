import { execSync } from "child_process";
import { safeInitFacet } from "diamond-engraver";
import { Wallet, utils } from "ethers";
import * as fs from "fs";
import { ethers } from "hardhat";
import { TsTokenId } from "term-structure-sdk";
import { AssetConfigStruct } from "../../typechain-types/contracts/zkTrueUp/token/ITokenFacet";
import {
  BASE_TOKEN_ASSET_CONFIG,
  ETH_ASSET_CONFIG,
  FACET_NAMES,
  INIT_FUNCTION_NAME,
} from "../../utils/config";
import { cutFacets } from "../../utils/cutFacets";
import { deployFacets } from "../../utils/deploy/deployFacets";
import {
  BaseTokenAddresses,
  FacetInfo,
  PriceFeeds,
  getString,
} from "../../utils/type";
import {
  getCurrentBranch,
  getLatestCommit,
  createDirectoryIfNotExists,
} from "../../utils/deployHelper";
const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.SEPOLIA_RPC_URL
  );

  const operatorAddr = getString(process.env.SEPOLIA_OPERATOR_ADDRESS);
  const deployerPrivKey = getString(process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);
  const adminAddr = getString(process.env.SEPOLIA_ADMIN_ADDRESS);
  const treasuryAddr = getString(process.env.SEPOLIA_TREASURY_ADDRESS);
  const insuranceAddr = getString(process.env.SEPOLIA_INSURANCE_ADDRESS);
  const vaultAddr = getString(process.env.SEPOLIA_VAULT_ADDRESS);
  const faucetOwner = getString(process.env.SEPOLIA_FAUCET_OWNER_ADDRESS);
  const oracleOwner = getString(process.env.SEPOLIA_ORACLE_OWNER_ADDRESS);
  const genesisStateRoot = getString(process.env.SEPOLIA_GENESIS_STATE_ROOT);
  const exchangeAddr = getString(process.env.SEPOLIA_EXCHANGE_ADDRESS);

  let currentDeployerNonce = await deployer.getTransactionCount();
  //   console.log("Deployer current nonce:", currentDeployerNonce);
  //   console.log(
  //     "Currnet network gas price: ",
  //     ethers.utils.formatUnits(await provider.getGasPrice(), "gwei"),
  //     "Gwei"
  //   );
  const feeData = await provider.getFeeData();
  //   console.log("Current network fee data: ", feeData);
  const deltaMaxFeePerGas = ethers.utils.parseUnits("20", "gwei");
  const deltaMaxPriorityFeePerGas = ethers.utils.parseUnits("3", "gwei");

  // Deploy WETH
  console.log("Deploying WETH...");
  const WETH = await ethers.getContractFactory("WETH9");
  const weth = await WETH.connect(deployer).deploy({
    nonce: currentDeployerNonce++,
    maxFeePerGas: feeData.maxFeePerGas
      ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
      : ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
      : ethers.utils.parseUnits("2", "gwei"),
  });
  //   console.log("Tx:", weth.deployTransaction);
  await weth.deployed();

  // deploy poseidonUnit2
  console.log("Deploying PoseidonUnit2...");
  const PoseidonFactory = new ethers.ContractFactory(
    generateABI(2),
    createCode(2),
    deployer
  );
  const poseidonUnit2Contract = await PoseidonFactory.deploy({
    nonce: currentDeployerNonce++,
    maxFeePerGas: feeData.maxFeePerGas
      ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
      : ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
      : ethers.utils.parseUnits("2", "gwei"),
  });
  //   console.log("Tx:", poseidonUnit2Contract.deployTransaction);
  await poseidonUnit2Contract.deployed();
  // process.exit();
  // deploy verifier
  console.log("Deploying Verifier...");
  const Verifier = await ethers.getContractFactory("Verifier");
  const verifier = await Verifier.connect(deployer).deploy({
    nonce: currentDeployerNonce++,
    maxFeePerGas: feeData.maxFeePerGas
      ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
      : ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
      : ethers.utils.parseUnits("2", "gwei"),
  });
  //   console.log("Tx: ", verifier.deployTransaction);
  await verifier.deployed();

  // deploy evacuVerifier
  console.log("Deploying EvacuVerifier...");
  const EvacuVerifier = await ethers.getContractFactory("EvacuVerifier");
  const evacuVerifier = await EvacuVerifier.connect(deployer).deploy({
    nonce: currentDeployerNonce++,
    maxFeePerGas: feeData.maxFeePerGas
      ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
      : ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
      : ethers.utils.parseUnits("2", "gwei"),
  });
  //   console.log("Tx: ", evacuVerifier.deployTransaction);
  await evacuVerifier.deployed();

  // deploy facet contracts
  console.log("Deploying facets...");
  const { facetFactories, facets, newDeployerNonce } = await deployFacets(
    FACET_NAMES,
    deployer,
    currentDeployerNonce
  );
  currentDeployerNonce = newDeployerNonce
    ? newDeployerNonce
    : currentDeployerNonce;

  // deploy diamond contract
  console.log("Deploying ZkTrueUp...");
  const ZkTrueUp = await ethers.getContractFactory("ZkTrueUp");
  const zkTrueUp = await ZkTrueUp.connect(deployer).deploy({
    nonce: currentDeployerNonce++,
    maxFeePerGas: feeData.maxFeePerGas
      ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
      : ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
      : ethers.utils.parseUnits("2", "gwei"),
  });
  //   console.log("Tx: ", zkTrueUp.deployTransaction);
  await zkTrueUp.deployed();

  // deploy diamond init contract
  console.log("Deploying ZkTrueUpInit...");
  const ZkTrueUpInit = await ethers.getContractFactory("ZkTrueUpInit");
  const zkTrueUpInit = await ZkTrueUpInit.connect(deployer).deploy({
    nonce: currentDeployerNonce++,
    maxFeePerGas: feeData.maxFeePerGas
      ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
      : ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
      : ethers.utils.parseUnits("2", "gwei"),
  });
  //   console.log("Tx: ", zkTrueUpInit.deployTransaction);
  await zkTrueUpInit.deployed();

  // Deploy faucet and base tokens for test
  console.log("Deploying TsFaucet and base tokens...");
  const TsFaucet = await ethers.getContractFactory("TsFaucet");
  const tsFaucet = await TsFaucet.connect(deployer).deploy(
    zkTrueUp.address,
    exchangeAddr,
    {
      nonce: currentDeployerNonce++,
      maxFeePerGas: feeData.maxFeePerGas
        ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
        : ethers.utils.parseUnits("100", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
        : ethers.utils.parseUnits("2", "gwei"),
    }
  );
  //   console.log("Tx: ", tsFaucet.deployTransaction);
  await tsFaucet.deployed();
  console.log("Transfering ownership of TsFaucet...");
  const tx = await tsFaucet.connect(deployer).transferOwnership(faucetOwner, {
    nonce: currentDeployerNonce++,
    maxFeePerGas: feeData.maxFeePerGas
      ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
      : ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
      : ethers.utils.parseUnits("2", "gwei"),
  });
  //   console.log("Tx:", tx);
  await tx.wait();

  const baseTokenAddresses: BaseTokenAddresses = {};
  const priceFeeds: PriceFeeds = {};

  // add ETH as base token
  baseTokenAddresses[TsTokenId.ETH] = await tsFaucet.tsERC20s(0);
  baseTokenAddresses[TsTokenId.WBTC] = await tsFaucet.tsERC20s(1);
  baseTokenAddresses[TsTokenId.USDT] = await tsFaucet.tsERC20s(2);
  baseTokenAddresses[TsTokenId.USDC] = await tsFaucet.tsERC20s(3);
  baseTokenAddresses[TsTokenId.DAI] = await tsFaucet.tsERC20s(4);

  // deploy oracle mock
  console.log("Deploying OracleMock...");
  const OracleMock = await ethers.getContractFactory("OracleMock");
  for (const tokenId of Object.keys(baseTokenAddresses)) {
    console.log("Deploying oracle mock for token: ", tokenId);
    const oracleMock = await OracleMock.connect(deployer).deploy({
      nonce: currentDeployerNonce++,
      maxFeePerGas: feeData.maxFeePerGas
        ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
        : ethers.utils.parseUnits("100", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
        : ethers.utils.parseUnits("2", "gwei"),
    });
    // console.log("Tx: ", oracleMock.deployTransaction);
    await oracleMock.deployed();
    console.log("Transfering ownership of OracleMock...");
    const tx = await oracleMock
      .connect(deployer)
      .transferOwnership(oracleOwner, {
        nonce: currentDeployerNonce++,
        maxFeePerGas: feeData.maxFeePerGas
          ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
          : ethers.utils.parseUnits("100", "gwei"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
          ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
          : ethers.utils.parseUnits("2", "gwei"),
      });
    // console.log("Tx: ", tx);
    await tx.wait();
    priceFeeds[tokenId] = oracleMock.address;
  }

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
      weth.address,
      poseidonUnit2Contract.address,
      verifier.address,
      evacuVerifier.address,
      //! adminAddr, only for test to easily update contract
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
        priceFeed: priceFeeds[TsTokenId.ETH],
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
  console.log("Current branch:", getCurrentBranch());
  console.log("Latest commit:", getLatestCommit());
  console.log(
    "Deploying contracts with deployer:",
    await deployer.getAddress()
  );
  console.log("Genesis state root: ", genesisStateRoot);
  for (const token of BASE_TOKEN_ASSET_CONFIG) {
    console.log(
      `${token.symbol} address: ${baseTokenAddresses[token.tokenId]}`,
      `with price feed ${priceFeeds[token.tokenId]}`
    );
  }
  console.log("TsFaucet address:", tsFaucet.address);
  console.log("WETH address:", weth.address);
  console.log("PoseidonUnit2 address:", poseidonUnit2Contract.address);
  console.log("Verifier address:", verifier.address);
  console.log("EvacuVerifier address:", evacuVerifier.address);
  for (const facetName of Object.keys(facets)) {
    console.log(`${facetName} address: ${facets[facetName].address}`);
  }
  console.log("ZkTrueUp address:", zkTrueUp.address);
  console.log("ZkTrueUpInit address:", zkTrueUpInit.address);

  const creationTx = await zkTrueUp.provider.getTransactionReceipt(
    zkTrueUp.deployTransaction.hash
  );
  console.log("ZkTrueUp is created at:", creationTx.blockNumber);

  const result: { [key: string]: any } = {};
  result["current_branch"] = getCurrentBranch();
  result["latest_commit"] = getLatestCommit();
  result["deployer"] = await deployer.getAddress();
  result["genesis_state_root"] = genesisStateRoot;
  for (const token of BASE_TOKEN_ASSET_CONFIG) {
    result[`${token.symbol}_address`] = baseTokenAddresses[token.tokenId];
    result[`${token.symbol}_price_feed`] = priceFeeds[token.tokenId];
  }
  result["ts_faucet"] = tsFaucet.address;
  result["weth"] = weth.address;
  result["poseidon_unit_2"] = poseidonUnit2Contract.address;
  result["verifier"] = verifier.address;
  result["evacu_verifier"] = evacuVerifier.address;
  for (const facetName of Object.keys(facets)) {
    result[facetName] = facets[facetName].address;
  }
  result["zk_true_up_init"] = zkTrueUpInit.address;
  result["zk_true_up"] = zkTrueUp.address;
  result["creation_block_number"] = creationTx.blockNumber.toString();

  await createDirectoryIfNotExists("tmp");
  const jsonString = JSON.stringify(result, null, 2);
  fs.writeFile("tmp/deploy_sepolia.json", jsonString, "utf8", (err: any) => {
    if (err) {
      console.error("An error occurred:", err);
    } else {
      console.log("JSON saved to tmp/deploy_sepolia.json");
    }
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

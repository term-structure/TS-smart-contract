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
    process.env.STAGING_SEPOLIA_RPC_URL
  );

  const deployerPrivKey = getString(
    process.env.STAGING_SEPOLIA_DEPLOYER_PRIVATE_KEY
  );
  const deployer = new Wallet(deployerPrivKey, provider);
  const operatorAddr = getString(process.env.STAGING_SEPOLIA_OPERATOR_ADDRESS);
  const adminAddr = getString(process.env.STAGING_SEPOLIA_ADMIN_ADDRESS);
  const treasuryAddr = getString(process.env.STAGING_SEPOLIA_TREASURY_ADDRESS);
  const insuranceAddr = getString(
    process.env.STAGING_SEPOLIA_INSURANCE_ADDRESS
  );
  const vaultAddr = getString(process.env.STAGING_SEPOLIA_VAULT_ADDRESS);
  const faucetOwnerAddr = getString(
    process.env.STAGING_SEPOLIA_FAUCET_OWNER_ADDRESS
  );
  const oracleOwnerAddr = getString(
    process.env.STAGING_SEPOLIA_ORACLE_OWNER_ADDRESS
  );
  const exchangeAddr = getString(process.env.STAGING_SEPOLIA_EXCHANGE_ADDRESS);
  const genesisStateRoot = getString(
    process.env.STAGING_SEPOLIA_GENESIS_STATE_ROOT
  );

  let currentDeployerNonce = await deployer.getTransactionCount();
  const feeData = await provider.getFeeData();
  const deltaMaxFeePerGas = ethers.utils.parseUnits("20", "gwei");
  const deltaMaxPriorityFeePerGas = ethers.utils.parseUnits("3", "gwei");

  // Deploy WETH
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
  console.log(`Deploying WETH... (tx:${weth.deployTransaction.hash})`);
  await weth.deployed();

  // deploy poseidonUnit2
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
  console.log(
    `Deploying PoseidonUnit2... (tx:${poseidonUnit2Contract.deployTransaction.hash})`
  );
  await poseidonUnit2Contract.deployed();

  // deploy verifier
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
  console.log(`Deploying Verifier... (tx:${verifier.deployTransaction.hash})`);
  await verifier.deployed();

  // deploy evacuVerifier
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
  console.log(
    `Deploying EvacuVerifier... (tx: ${evacuVerifier.deployTransaction.hash})`
  );
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
  console.log(`Deploying ZkTrueUp... (tx: ${zkTrueUp.deployTransaction.hash})`);
  await zkTrueUp.deployed();

  // deploy diamond init contract
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
  console.log(
    `Deploying ZkTrueUpInit... (tx: ${zkTrueUpInit.deployTransaction.hash})`
  );
  await zkTrueUpInit.deployed();

  // Deploy faucet and base tokens for test
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
  console.log(
    `Deploying TsFaucet and base tokens... (tx: ${tsFaucet.deployTransaction.hash})`
  );
  await tsFaucet.deployed();

  const tx = await tsFaucet
    .connect(deployer)
    .transferOwnership(faucetOwnerAddr, {
      nonce: currentDeployerNonce++,
      maxFeePerGas: feeData.maxFeePerGas
        ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
        : ethers.utils.parseUnits("100", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
        : ethers.utils.parseUnits("2", "gwei"),
    });
  console.log(`Transfering ownership of TsFaucet... (tx: ${tx.hash})`);
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
    const oracleMock = await OracleMock.connect(deployer).deploy({
      nonce: currentDeployerNonce++,
      maxFeePerGas: feeData.maxFeePerGas
        ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
        : ethers.utils.parseUnits("100", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
        : ethers.utils.parseUnits("2", "gwei"),
    });
    console.log(
      `Deploying oracle mock for ${tokenId}... (tx: ${oracleMock.deployTransaction.hash})`
    );
    await oracleMock.deployed();

    const tx = await oracleMock
      .connect(deployer)
      .transferOwnership(oracleOwnerAddr, {
        nonce: currentDeployerNonce++,
        maxFeePerGas: feeData.maxFeePerGas
          ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
          : ethers.utils.parseUnits("100", "gwei"),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
          ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
          : ethers.utils.parseUnits("2", "gwei"),
      });
    console.log(`Transfering ownership of OracleMock... (tx: ${tx.hash})`);
    await tx.wait();
    priceFeeds[tokenId] = oracleMock.address;
  }

  // cut facets
  console.log("Cutting facets...");
  const facetInfos: FacetInfo[] = Object.keys(facets).map((facetName) => {
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
  console.log("Diamond initialized successfully 💎💎💎\n");

  // log addresses
  console.log("Current branch:", getCurrentBranch());
  console.log("Latest commit:", getLatestCommit());
  console.log("Deployer address:", await deployer.getAddress());
  console.log("Operator address:", operatorAddr);
  console.log("Faucet owner address:", faucetOwnerAddr);
  console.log("Oracle owner address:", oracleOwnerAddr);
  console.log("Genesis state root: ", genesisStateRoot);
  console.log("WETH address:", weth.address);
  console.log("TsFaucet address:", tsFaucet.address);
  for (const token of BASE_TOKEN_ASSET_CONFIG) {
    console.log(
      `${token.symbol} address: ${baseTokenAddresses[token.tokenId]}`,
      `with price feed ${priceFeeds[token.tokenId]}`
    );
  }
  console.log("PoseidonUnit2 address:", poseidonUnit2Contract.address);
  console.log("Verifier address:", verifier.address);
  console.log("EvacuVerifier address:", evacuVerifier.address);
  for (const facetName of Object.keys(facets)) {
    console.log(`${facetName} address: ${facets[facetName].address}`);
  }
  console.log("ZkTrueUpInit address:", zkTrueUpInit.address);
  console.log("ZkTrueUp address:", zkTrueUp.address);

  const creationTx = await zkTrueUp.provider.getTransactionReceipt(
    zkTrueUp.deployTransaction.hash
  );
  console.log("Created block of zkTrueUp:", creationTx.blockNumber);

  const result: { [key: string]: any } = {};
  result["current_branch"] = getCurrentBranch();
  result["latest_commit"] = getLatestCommit();
  result["deployer"] = await deployer.getAddress();
  result["operator"] = operatorAddr;
  result["faucet_owner"] = faucetOwnerAddr;
  result["oracle_owner"] = oracleOwnerAddr;
  result["weth"] = weth.address;
  result["ts_faucet"] = tsFaucet.address;
  result["genesis_state_root"] = genesisStateRoot;
  for (const token of BASE_TOKEN_ASSET_CONFIG) {
    result[`${token.symbol}_address`] = baseTokenAddresses[token.tokenId];
    result[`${token.symbol}_price_feed`] = priceFeeds[token.tokenId];
  }
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
  const currentDate = new Date();
  const year = currentDate.getFullYear().toString();
  const month = (currentDate.getMonth() + 1).toString().padStart(2, "0"); // Month is 0-indexed, add 1 to it, pad with zero if needed
  const day = currentDate.getDate().toString().padStart(2, "0"); // Pad the day with zero if needed
  const dateString = `${year}${month}${day}`;
  fs.writeFile(
    `tmp/deploy_testnet_sepolia_${dateString}.json`,
    jsonString,
    "utf8",
    (err: any) => {
      if (err) {
        console.error("An error occurred:", err);
      } else {
        console.log(
          `JSON saved to tmp/deploy_testnet_sepolia_${dateString}.json`
        );
      }
    }
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

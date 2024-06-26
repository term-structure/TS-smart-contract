import { ethers } from "hardhat";
import { deployFacets } from "./deployFacets";
import {
  BASE_TOKEN_ASSET_CONFIG,
  ETH_ASSET_CONFIG,
  FACET_NAMES,
  INIT_FUNCTION_NAME,
} from "../config";
import { BaseTokenAddresses, FacetInfo, PriceFeeds } from "../type";
import { TsTokenId } from "term-structure-sdk";
import { cutFacets } from "../cutFacets";
import { ContractFactory, utils } from "ethers";
import { AssetConfigStruct } from "../../typechain-types/contracts/zkTrueUp/token/ITokenFacet";
import { safeInitFacet } from "diamond-engraver";
import { getCurrentBranch, getLatestCommit } from "../deployHelper";

const circomlibjs = require("circomlibjs");
const { createCode, generateABI } = circomlibjs.poseidonContract;

export async function deployContracts(
  env: any,
  currentDeployerNonce: number,
  feeData: any,
  deltaMaxFeePerGas: any,
  deltaMaxPriorityFeePerGas: any,
  ZkTrueUpInit: ContractFactory
) {
  // Deploy WETH
  const WETH = await ethers.getContractFactory("WETH9");
  const weth = await WETH.connect(env.deployer).deploy({
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
    env.deployer
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
  const verifier = await Verifier.connect(env.deployer).deploy({
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
  const evacuVerifier = await EvacuVerifier.connect(env.deployer).deploy({
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
    env.deployer,
    currentDeployerNonce
  );
  currentDeployerNonce = newDeployerNonce
    ? newDeployerNonce
    : currentDeployerNonce;

  // deploy diamond contract
  const ZkTrueUp = await ethers.getContractFactory("ZkTrueUp");
  const zkTrueUp = await ZkTrueUp.connect(env.deployer).deploy({
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
  const zkTrueUpInit = await ZkTrueUpInit.connect(env.deployer).deploy({
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
  const tsFaucet = await TsFaucet.connect(env.deployer).deploy(
    zkTrueUp.address,
    env.exchangeAddr,
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

  let tx = await tsFaucet
    .connect(env.deployer)
    .transferOwnership(env.faucetOwnerAddr, {
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
    const oracleMock = await OracleMock.connect(env.deployer).deploy({
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
      .connect(env.deployer)
      .transferOwnership(env.oracleOwnerAddr, {
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

  const fnSelectors = await cutFacets(
    env.deployer,
    env.provider,
    zkTrueUp,
    facetInfos
  );
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
      env.deployer.address,
      env.operatorAddr,
      env.treasuryAddr,
      env.insuranceAddr,
      env.vaultAddr,
      env.genesisStateRoot,
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
    env.deployer,
    env.provider,
    zkTrueUp,
    zkTrueUpInit.address,
    ZkTrueUpInit,
    INIT_FUNCTION_NAME,
    initData,
    onlyCall
  );

  // change operator role from operator to governor
  const OPERATOR_ROLE = ethers.utils.id("OPERATOR_ROLE");
  tx = await zkTrueUp
    .connect(env.deployer)
    .grantRole(OPERATOR_ROLE, env.governorAddr, {
      maxFeePerGas: feeData.maxFeePerGas
        ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
        : ethers.utils.parseUnits("100", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
        : ethers.utils.parseUnits("2", "gwei"),
    });
  await tx.wait();
  tx = await zkTrueUp
    .connect(env.deployer)
    .revokeRole(OPERATOR_ROLE, env.operatorAddr, {
      maxFeePerGas: feeData.maxFeePerGas
        ? feeData.maxFeePerGas.add(deltaMaxFeePerGas)
        : ethers.utils.parseUnits("100", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? feeData.maxPriorityFeePerGas.add(deltaMaxPriorityFeePerGas)
        : ethers.utils.parseUnits("2", "gwei"),
    });
  await tx.wait();

  console.log("Diamond initialized successfully 💎💎💎\n");

  return {
    zkTrueUp,
    zkTrueUpInit,
    weth,
    tsFaucet,
    baseTokenAddresses,
    priceFeeds,
    verifier,
    evacuVerifier,
    poseidonUnit2Contract,
    facets,
  };
}

export function packResults(env: any, res: any, creationTx: any) {
  const result: { [key: string]: unknown } = {};
  result["current_branch"] = getCurrentBranch();
  result["latest_commit"] = getLatestCommit();
  result["genesis_state_root"] = env.genesisStateRoot;
  result["deployer"] = env.deployer.address;
  result["operator"] = env.operatorAddr;
  result["faucet_owner"] = env.faucetOwnerAddr;
  result["oracle_owner"] = env.oracleOwnerAddr;
  result["exchange"] = env.exchangeAddr;
  result["admin"] = env.adminAddr;
  result["treasury"] = env.treasuryAddr;
  result["insurance"] = env.insuranceAddr;
  result["vault"] = env.vaultAddr;
  result["weth"] = res.weth.address;
  result["ts_faucet"] = res.tsFaucet.address;
  for (const token of BASE_TOKEN_ASSET_CONFIG) {
    result[`${token.symbol}_address`] = res.baseTokenAddresses[token.tokenId];
    result[`${token.symbol}_price_feed`] = res.priceFeeds[token.tokenId];
  }
  result["poseidon_unit_2"] = res.poseidonUnit2Contract.address;
  result["verifier"] = res.verifier.address;
  result["evacu_verifier"] = res.evacuVerifier.address;
  for (const facetName of Object.keys(res.facets)) {
    result[facetName] = res.facets[facetName].address;
  }
  result["zk_true_up_init"] = res.zkTrueUpInit.address;
  result["zk_true_up"] = res.zkTrueUp.address;
  result["creation_block_number"] = creationTx.blockNumber.toString();
  return result;
}

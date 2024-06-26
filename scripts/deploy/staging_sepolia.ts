import { Wallet } from "ethers";
import * as fs from "fs";
import { ethers } from "hardhat";
import { BASE_TOKEN_ASSET_CONFIG } from "../../utils/config";
import { getString } from "../../utils/type";
import {
  getCurrentBranch,
  getLatestCommit,
  createDirectoryIfNotExists,
} from "../../utils/deployHelper";
import {
  deployContracts,
  packResults,
} from "../../utils/deploy/deployContracts";

function getEnv() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.STAGING_SEPOLIA_RPC_URL
  );

  const deployerPrivKey = getString(
    process.env.STAGING_SEPOLIA_DEPLOYER_PRIVATE_KEY
  );
  const deployer = new Wallet(deployerPrivKey, provider);

  const governorAddr = getString(process.env.STAGING_SEPOLIA_GOVERNOR_ADDRESS);
  const operatorAddr = getString(process.env.STAGING_SEPOLIA_OPERATOR_ADDRESS);
  const faucetOwnerAddr = getString(
    process.env.STAGING_SEPOLIA_FAUCET_OWNER_ADDRESS
  );
  const oracleOwnerAddr = getString(
    process.env.STAGING_SEPOLIA_ORACLE_OWNER_ADDRESS
  );

  const adminAddr = getString(process.env.STAGING_SEPOLIA_ADMIN_ADDRESS);
  const treasuryAddr = getString(process.env.STAGING_SEPOLIA_TREASURY_ADDRESS);
  const insuranceAddr = getString(
    process.env.STAGING_SEPOLIA_INSURANCE_ADDRESS
  );
  const vaultAddr = getString(process.env.STAGING_SEPOLIA_VAULT_ADDRESS);

  const exchangeAddr = getString(process.env.STAGING_SEPOLIA_EXCHANGE_ADDRESS);
  const genesisStateRoot = getString(
    process.env.STAGING_SEPOLIA_GENESIS_STATE_ROOT
  );

  return {
    provider,
    deployer,
    governorAddr,
    operatorAddr,
    faucetOwnerAddr,
    oracleOwnerAddr,
    adminAddr,
    treasuryAddr,
    insuranceAddr,
    vaultAddr,
    exchangeAddr,
    genesisStateRoot,
  };
}

export const main = async () => {
  const env = getEnv();

  const currentDeployerNonce = await env.deployer.getTransactionCount();
  const feeData = await env.provider.getFeeData();
  const deltaMaxFeePerGas = ethers.utils.parseUnits("50", "gwei");
  const deltaMaxPriorityFeePerGas = ethers.utils.parseUnits("10", "gwei");

  const ZkTrueUpInit = await ethers.getContractFactory("SepoliaZkTrueUpInit");

  const res = await deployContracts(
    env,
    currentDeployerNonce,
    feeData,
    deltaMaxFeePerGas,
    deltaMaxPriorityFeePerGas,
    ZkTrueUpInit
  );

  const creationTx = await res.zkTrueUp.provider.getTransactionReceipt(
    res.zkTrueUp.deployTransaction.hash
  );

  const result = packResults(env, res, creationTx);

  await createDirectoryIfNotExists("tmp");
  const jsonString = JSON.stringify(result, null, 2);
  const currentDate = new Date();
  const year = currentDate.getFullYear().toString();
  const month = (currentDate.getMonth() + 1).toString().padStart(2, "0"); // Month is 0-indexed, add 1 to it, pad with zero if needed
  const day = currentDate.getDate().toString().padStart(2, "0"); // Pad the day with zero if needed
  const dateString = `${year}${month}${day}`;
  fs.writeFile(
    `tmp/deploy_staging_sepolia_${dateString}.json`,
    jsonString,
    "utf8",
    (err: unknown) => {
      if (err) {
        console.error("An error occurred:", err);
      } else {
        console.log(
          `JSON saved to tmp/deploy_staging_sepolia_${dateString}.json`
        );
      }
    }
  );

  // log addresses
  console.log("Current branch:", getCurrentBranch());
  console.log("Latest commit:", getLatestCommit());
  console.log("Deployer address:", await env.deployer.getAddress());
  console.log("Operator address:", env.operatorAddr);
  console.log("Faucet owner address:", env.faucetOwnerAddr);
  console.log("Oracle owner address:", env.oracleOwnerAddr);
  console.log("Genesis state root: ", env.genesisStateRoot);
  console.log("WETH address:", res.weth.address);
  console.log("TsFaucet address:", res.tsFaucet.address);
  for (const token of BASE_TOKEN_ASSET_CONFIG) {
    console.log(
      `${token.symbol} address: ${res.baseTokenAddresses[token.tokenId]}`,
      `with price feed ${res.priceFeeds[token.tokenId]}`
    );
  }
  console.log("PoseidonUnit2 address:", res.poseidonUnit2Contract.address);
  console.log("Verifier address:", res.verifier.address);
  console.log("EvacuVerifier address:", res.evacuVerifier.address);
  for (const facetName of Object.keys(res.facets)) {
    console.log(`${facetName} address: ${res.facets[facetName].address}`);
  }
  console.log("ZkTrueUpInit address:", res.zkTrueUpInit.address);
  console.log("ZkTrueUp address:", res.zkTrueUp.address);

  console.log("Created block of zkTrueUp:", creationTx.blockNumber);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import "dotenv/config";
import "hardhat-contract-sizer";
import "hardhat-docgen";
import "hardhat-spdx-license-identifier";
import "hardhat-storage-layout";
import "hardhat-tracer";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { resolve } from "path";
import { getBoolean, getString } from "./utils/type";
import { existsSync, mkdirSync } from "fs";
import "./tasks";

task("storage-layout", "Prints the storage layout", async (_, hre) => {
  await hre.storageLayout.export();
});

if (!existsSync(resolve(__dirname, "./reports"))) {
  mkdirSync(resolve(__dirname, "./reports"));
}

const mnemonic =
  process.env.MNEMONIC ||
  "test test test test test test test test test test test junk";

const config: HardhatUserConfig = {
  paths: {
    tests: getBoolean(process.env.IS_FORK_MAINNET, false)
      ? "./test/mainnetFork"
      : "./test/zkTrueUp",
  },
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.4.18",
      },
    ],
  },
  spdxLicenseIdentifier: {
    runOnCompile: false,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    strict: true,
    outputFile: getBoolean(process.env.IS_FORK_MAINNET, false)
      ? resolve(__dirname, "./reports/contract-sizes-mainnetFork.txt")
      : resolve(__dirname, "./reports/contract-sizes-zkTrueUp.txt"),
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 20,
    noColors: true,
    outputFile: getBoolean(process.env.IS_FORK_MAINNET, false)
      ? resolve(__dirname, "./reports/gas-report-mainnetFork.txt")
      : resolve(__dirname, "./reports/gas-report-zkTrueUp.txt"),
  },
  networks: {
    hardhat: {
      accounts: {
        count: 20,
        mnemonic,
      },
      allowUnlimitedContractSize: true,
      initialDate: new Date("2022-08-01T00:00:00.000Z").toISOString(),
      forking: getBoolean(process.env.IS_FORK_MAINNET, false)
        ? { url: getString(process.env.MAINNET_RPC_URL), blockNumber: 17426510 }
        : undefined,
    },
    // dev: {
    //   url: getString(process.env.DEVNET_RPC_URL) || "",
    //   accounts: [getString(process.env.DEVNET_DEPLOYER_PRIVATE_KEY)],
    // },
    // goerli: {
    //   url: getString(process.env.GOERLI_RPC_URL),
    //   accounts: [
    //     getString(process.env.GOERLI_DEPLOYER_PRIVATE_KEY),
    //     getString(process.env.GOERLI_FAUCET_OPERATOR_PRIVATE_KEY),
    //     getString(process.env.GOERLI_ORACLE_OPERATOR_PRIVATE_KEY),
    //   ],
    // },
  },
};

export default config;

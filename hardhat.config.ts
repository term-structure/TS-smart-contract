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
import { resolve } from "path";
import { getString } from "./utils/type";
import { existsSync, mkdirSync } from "fs";
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
      {
        version: "0.4.24",
      },
      {
        version: "0.6.11",
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
    outputFile: resolve(__dirname, "./reports/contract-sizes.txt"),
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 20,
    noColors: true,
    outputFile: resolve(__dirname, "./reports/gas-report.txt"),
  },
  networks: {
    hardhat: {
      accounts: {
        count: 20,
        mnemonic,
      },
      allowUnlimitedContractSize: true,
      forking: {
        url: getString(process.env.MAINNET_RPC_URL),
      },
    },
    // goerli: {
    //   url: getString(process.env.GOERLI_RPC_URL),
    //   accounts: [getString(process.env.GOERLI_DEPLOYER_PRIVATE_KEY)],
    // },
  },
};

export default config;

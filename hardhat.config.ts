import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import "hardhat-contract-sizer";
import "hardhat-docgen";
import "hardhat-spdx-license-identifier";
import "hardhat-storage-layout";
import "hardhat-tracer";
import "hardhat-gas-reporter";
import { resolve } from "path";

task("storage-layout", "Prints the storage layout", async (_, hre) => {
  await hre.storageLayout.export();
});

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
    // outputFile: resolve(__dirname, "./reports/contract-sizes.txt"),
  },
  gasReporter: {
    enabled: getBoolean(process.env.REPORT_GAS, true),
    currency: "USD",
    gasPrice: 20,
    // outputFile: resolve(__dirname, './reports/gas-report.txt'),
  },
};

function getBoolean(str: string | undefined, _default: boolean) {
  try {
    if (str === "" || typeof str === "undefined") return _default;
    return !!JSON.parse(str.toLowerCase());
  } catch (error) {
    throw new Error(`'${str}' is not a boolean`);
  }
}

export default config;

import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import * as contracts from "../../typechain-types/factories/contracts";
import fs from "fs";
import { resolve } from "path";

export type FnSelectors = { [key: string]: string };

export const main = async () => {
  const outputJSON: any = [];
  const contractFactories: ContractFactory[] = [];
  contractFactories.push(await ethers.getContractFactory("ZkTrueUp"));
  contractFactories.push(await ethers.getContractFactory("AccountFacet"));

  for (const contractFactory of contractFactories) {
    const fnSelectors: FnSelectors = {};
    let functionNum = 0;
    Object.keys(contractFactory.interface.functions).map((fn) => {
      const sl = contractFactory.interface.getSighash(fn);
      fnSelectors[fn] = sl;
      functionNum++;
    });
    outputJSON.push({
      contractName: `${contractFactory}`,
      functionNum: functionNum,
      fnSelectors: fnSelectors,
    });
  }
  // output to file
  fs.writeFileSync(
    resolve(__dirname, "../../reports/diamondLoupe.json"),
    JSON.stringify(outputJSON, null, 2)
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

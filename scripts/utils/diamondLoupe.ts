import { ethers } from "hardhat";
import { resolve } from "path";
import fs from "fs";

export type FnSelectors = { [key: string]: string };

export const main = async () => {
  const outputJSON: any = [];
  const root = resolve(__dirname, "../../artifacts/contracts");

  const getContractNames = (root: string): string[] => {
    const files = fs.readdirSync(root);
    let contractNames: string[] = [];

    for (const file of files) {
      const path = `${root}/${file}`;
      const stat = fs.statSync(path);
      if (stat.isDirectory() && file.endsWith(".sol")) {
        const target = resolve(path, file.replace(".sol", ".json"));
        if (fs.existsSync(target)) {
          const data = fs.readFileSync(target, "utf-8");
          const json = JSON.parse(data);
          if (json.bytecode !== "0x" && json.abi.length > 0) {
            contractNames.push(json.contractName);
          } else {
            // Do nothing, this is an contract without bytecode
          }
        } else {
          console.warn(`File not found: ${target}`);
        }
      } else if (stat.isDirectory()) {
        contractNames = contractNames.concat(getContractNames(path));
      } else {
        // Do nothing
      }
    }
    return contractNames;
  };

  const contractNames = getContractNames(root);

  for (const contractName of contractNames) {
    const contractFactory = await ethers.getContractFactory(contractName);
    // contractFactories.push(await ethers.getContractFactory(contractName));
    const fnSelectors: FnSelectors = {};
    let functionNum = 0;
    Object.keys(contractFactory.interface.functions).map((fn) => {
      const sl = contractFactory.interface.getSighash(fn);
      fnSelectors[fn] = sl;
      functionNum++;
    });
    outputJSON.push({
      contractName: contractName,
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

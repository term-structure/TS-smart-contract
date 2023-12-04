import { task, types } from "hardhat/config";
import fs from "fs";
import path from "path";

const getTheAbi = () => {
  try {
    const dir = path.resolve(
      __dirname,
      // "../artifacts/contracts/zkTrueUp/rollup/RollupFacet.sol/RollupFacet.json",
      "../artifacts/contracts/zkTrueUp/account/AccountFacet.sol/AccountFacet.json"
    );
    const file = fs.readFileSync(dir, "utf8");
    const json = JSON.parse(file);
    const abi = json.abi;
    return abi;
  } catch (e) {
    console.log("e", e);
  }
};

task("customError", "parse custom error")
  .addParam("data", "error data", undefined, types.string)
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const targetSelector = args.data.substring(0, 10);
    const abi = getTheAbi();
    const iface = new ethers.utils.Interface(abi);
    for (const key in iface.errors) {
      const errorSelector = ethers.utils.id(key).substring(0, 10);
      if (errorSelector === targetSelector) {
        console.log(`Error: ${key}`);
        const res = ethers.utils.defaultAbiCoder.decode(
          iface.errors[key].inputs,
          "0x" + args.data.substring(10)
        );
        console.log(res);
        return;
      }
    }
    console.log("Error selector not found");
  });

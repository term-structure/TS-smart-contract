import { ethers } from "hardhat";
import { getString } from "../../../../utils/type";
import { Wallet } from "ethers";
import { WrapperRouter__factory } from "../../../../typechain-types";

const zkTrueUpAddr = "";

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.MAINNET_RPC_URL
  );
  const deployerPrivKey = getString(process.env.MAINNET_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);

  console.log(
    "Deploying customized WrapperRouter contracts with deployer:",
    await deployer.getAddress()
  );

  // deploy WrapperRouter
  console.log("Deploying WrapperRouter...");
  const WrapperRouterFactory = (await ethers.getContractFactory(
    "WrapperRouter"
  )) as WrapperRouter__factory;

  const wrapperRouter = await WrapperRouterFactory.deploy(zkTrueUpAddr);
  await wrapperRouter.deployed();
  console.log("WrapperRouter address:", wrapperRouter.address);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

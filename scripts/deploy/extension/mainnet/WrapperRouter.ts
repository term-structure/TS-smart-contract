import { ethers } from "hardhat";
import { getString } from "../../../../utils/type";
import { Wallet } from "ethers";
import { WrapperRouter__factory } from "../../../../typechain-types";
const { upgrades } = require("hardhat");

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

  const proxy = await upgrades.deployProxy(
    WrapperRouterFactory,
    [zkTrueUpAddr],
    { initializer: "initialize", kind: "uups" }
  );

  console.log("Proxy address", proxy.address);
  const receipt = await proxy.deployTransaction.wait(2);
  console.log(
    "Implementation address:",
    await upgrades.erc1967.getImplementationAddress(proxy.address)
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

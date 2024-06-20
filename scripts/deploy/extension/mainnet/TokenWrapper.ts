import { ethers } from "hardhat";
import { getString } from "../../../../utils/type";
import { Wallet } from "ethers";
import { TokenWrapper__factory } from "../../../../typechain-types";

const underlyingAddress = "";
const wrappedTokenName = "";
const wrappedTokenSymbol = "";

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.MAINNET_RPC_URL
  );
  const deployerPrivKey = getString(process.env.MAINNET_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);

  console.log(
    "Deploying customized TokenWrapper contracts with deployer:",
    await deployer.getAddress()
  );

  // deploy TokenWrapper
  console.log("Deploying TokenWrapper...");
  const TokenWrapperFactory = (await ethers.getContractFactory(
    "TokenWrapper"
  )) as TokenWrapper__factory;

  const tokenWrapper = await TokenWrapperFactory.deploy(
    underlyingAddress,
    wrappedTokenName,
    wrappedTokenSymbol
  );
  await tokenWrapper.deployed();
  console.log("TokenWrapper address:", tokenWrapper.address);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { ethers } from "hardhat";
import { getString } from "../../../../utils/type";
import { BigNumber, Wallet } from "ethers";
import { PTWithRedStonePriceFeed__factory } from "../../../../typechain-types";

const PendlePYLpOracleAddr = "0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2";
const marketAddr = "";
const duration = 900;
const redstonePriceFeedAddr = "";

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.MAINNET_RPC_URL
  );
  const deployerPrivKey = getString(process.env.MAINNET_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);

  console.log(
    "Deploying PTWithRedStonePriceFeed contracts with deployer:",
    await deployer.getAddress()
  );

  // deploy PTWithRedStonePriceFeed
  console.log("Deploying PTWithRedStonePriceFeed...");
  const PTWithRedStonePriceFeedFactory = (await ethers.getContractFactory(
    "PTWithRedStonePriceFeed"
  )) as PTWithRedStonePriceFeed__factory;

  const PTWithRedStonePriceFeed = await PTWithRedStonePriceFeedFactory.deploy(
    PendlePYLpOracleAddr,
    marketAddr,
    duration,
    redstonePriceFeedAddr,
    { gasLimit: 10000000 }
  );
  await PTWithRedStonePriceFeed.deployed();
  console.log(
    "PTWithRedStonePriceFeed address:",
    PTWithRedStonePriceFeed.address
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

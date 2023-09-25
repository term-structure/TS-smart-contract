import { ethers } from "hardhat";
import { getString } from "../../../../utils/type";
import { Wallet } from "ethers";
import { WstETHPriceFeed__factory } from "../../../../typechain-types";
import { GOERLI_ADDRESS } from "../../../../utils/config";

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.GOERLI_RPC_URL
  );
  const deployerPrivKey = getString(process.env.GOERLI_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);

  console.log(
    "Deploying customized wsteth oracle contracts with deployer:",
    await deployer.getAddress()
  );

  // deploy wstETHPriceFeed
  console.log("Deploying wstETHPriceFeed...");
  const wstETHPriceFeedFactory = (await ethers.getContractFactory(
    "WstETHPriceFeed"
  )) as WstETHPriceFeed__factory;
  const wstETHAddr = GOERLI_ADDRESS.WSTETH;
  const stETHPriceFeed = getString(process.env.GOERLI_STETH_PRICE_FEED);
  const wstETHPriceFeed = await wstETHPriceFeedFactory.deploy(
    wstETHAddr,
    stETHPriceFeed
  );
  await wstETHPriceFeed.deployed();
  console.log("WstETHPriceFeed address:", wstETHPriceFeed.address);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

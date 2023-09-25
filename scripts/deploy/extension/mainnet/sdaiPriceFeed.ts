import { ethers } from "hardhat";
import { getString } from "../../../../utils/type";
import { Wallet } from "ethers";
import { SDaiPriceFeed__factory } from "../../../../typechain-types";
import { MAINNET_ADDRESS } from "../../../../utils/config";

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.MAINNET_RPC_URL
  );
  const deployerPrivKey = getString(process.env.MAINNET_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);

  console.log(
    "Deploying customized sDai oracle contracts with deployer:",
    await deployer.getAddress()
  );

  // deploy sDaiPriceFeed
  console.log("Deploying sDaiPriceFeed...");
  const sDaiPriceFeedFactory = (await ethers.getContractFactory(
    "SDaiPriceFeed"
  )) as SDaiPriceFeed__factory;
  const potAddr = MAINNET_ADDRESS.MAKER_POT;
  const daiPriceFeed = MAINNET_ADDRESS.DAI_PRICE_FEED;
  const sDaiPriceFeed = await sDaiPriceFeedFactory.deploy(
    potAddr,
    daiPriceFeed
  );
  await sDaiPriceFeed.deployed();
  console.log("sDaiPriceFeed address:", sDaiPriceFeed.address);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

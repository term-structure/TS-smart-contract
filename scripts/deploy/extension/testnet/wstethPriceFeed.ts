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

  // deploy stETH price feed on testnet, because we have not existed stETH price feed on testnet
  const stETHPriceFeedFactory = await ethers.getContractFactory("OracleMock");
  const stETHPriceFeed = await stETHPriceFeedFactory.deploy();
  await stETHPriceFeed.deployed();
  console.log("stETHPriceFeed address:", stETHPriceFeed.address);

  // deploy wstETHPriceFeed
  console.log("Deploying wstETHPriceFeed...");
  const wstETHPriceFeedFactory = (await ethers.getContractFactory(
    "WstETHPriceFeed"
  )) as WstETHPriceFeed__factory;
  const wstETHAddr = GOERLI_ADDRESS.WSTETH;
  const wstETHPriceFeed = await wstETHPriceFeedFactory.deploy(
    wstETHAddr,
    stETHPriceFeed.address
  );
  await wstETHPriceFeed.deployed();
  console.log("WstETHPriceFeed address:", wstETHPriceFeed.address);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

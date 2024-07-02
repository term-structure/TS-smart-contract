import { ethers } from "hardhat";

async function main() {
  const tokenName = "PT ether.fi weETH 26SEP2024";
  const tokenSymbol = "PT-weETH-26SEP2024";
  const tokenDecimals = 18;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const balance = await deployer.getBalance();
  console.log("Account balance:", ethers.utils.formatEther(balance.toString()));

  const ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
  const ERC20Mock = await ERC20MockFactory.deploy(
    tokenName,
    tokenSymbol,
    tokenDecimals
  );

  await ERC20Mock.deployed();

  console.log("Token deployed to:", ERC20Mock.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

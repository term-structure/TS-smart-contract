import { Signer } from "ethers";
import { ethers } from "hardhat";
import { BaseTokenAddresses, PriceFeeds } from "../type";
import { ERC20Mock, OracleMock } from "../../typechain-types";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";

export async function deployBaseTokens(deployer: Signer, tokenConfigs: any) {
  const OracleMock = await ethers.getContractFactory("OracleMock");
  OracleMock.connect(deployer);
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  ERC20Mock.connect(deployer);

  const baseTokenAddresses: BaseTokenAddresses = {};
  const priceFeeds: PriceFeeds = {};
  for (let i = 0; i < tokenConfigs.length; i++) {
    const token = tokenConfigs[i];
    const oracleMock = (await OracleMock.deploy()) as OracleMock;
    await oracleMock.deployed();
    priceFeeds[token.tokenId] = oracleMock.address;

    if (tokenConfigs[i].symbol == "ETH") {
      baseTokenAddresses[token.tokenId] = DEFAULT_ETH_ADDRESS;
      continue;
    }

    const erc20Mock = (await ERC20Mock.deploy(
      token.name,
      token.symbol,
      token.decimals
    )) as ERC20Mock;
    await erc20Mock.deployed();
    baseTokenAddresses[token.tokenId] = erc20Mock.address;
  }
  return { baseTokenAddresses, priceFeeds };
}

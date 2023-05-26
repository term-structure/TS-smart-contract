import { Contract, Signer } from "ethers";
import { ethers } from "hardhat";

export const deployLibs = async (
  libNames: string[],
  deployer: Signer
): Promise<{ [key: string]: Contract }> => {
  const libs: { [key: string]: Contract } = {};
  for (const libName of libNames) {
    const libFactory = await ethers.getContractFactory(libName);
    const deployedLib = await libFactory.connect(deployer).deploy();
    await deployedLib.deployed();
    libs[libName] = deployedLib;
  }
  return libs;
};

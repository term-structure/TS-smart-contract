import { Contract } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export const deployLibs = async (
  libNames: string[],
  deployer: SignerWithAddress
): Promise<Contract[]> => {
  const libs: Contract[] = [];
  for (let i = 0; i < libNames.length; i++) {
    const Lib = await ethers.getContractFactory(libNames[i]);
    const libContract = await Lib.connect(deployer).deploy();
    await libContract.deployed();
    libs.push(libContract);
  }
  return libs;
};

import { ethers } from "hardhat";
import { ZkTrueUp } from "../typechain-types";
import { ContractFactory, Signer } from "ethers";
import { diamondCutAction } from "./type";

export const diamondCut = async (
  signer: Signer,
  diamond: ZkTrueUp,
  contractAddr: string,
  factory: ContractFactory,
  excludeList?: string[], // list of function selectors to exclude
  action?: diamondCutAction // 0 = add, 1 = replace, 2 = remove
) => {
  const registerSelectors: string[] = [];
  const facets = [
    {
      target: contractAddr,
      action: action ? action : 0,
      selectors: Object.keys(factory.interface.functions)
        .filter(
          (fn) => !excludeList?.includes(factory.interface.getSighash(fn))
        )
        .map((fn) => {
          const sl = factory.interface.getSighash(fn);
          registerSelectors.push(sl);
          return sl;
        }),
    },
  ];
  const tx = await diamond
    .connect(signer)
    .diamondCut(facets, ethers.constants.AddressZero, "0x");

  await tx.wait();
  return registerSelectors;
};

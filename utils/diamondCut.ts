import { ethers } from "hardhat";
import { ZkTrueUp } from "../typechain-types";
import { ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

type diamondCutAction = 0 | 1 | 2;

export const diamondCut = async (
  signer: SignerWithAddress,
  diamond: ZkTrueUp,
  contractAddr: string,
  factory: ContractFactory,
  excludeList?: string[], // list of function selectors to exclude
  action?: diamondCutAction // 0 = add, 1 = remove, 2 = replace
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

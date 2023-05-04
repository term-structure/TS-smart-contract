import { ethers } from "hardhat";
import { ZkTrueUp } from "../typechain-types";
import { ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export const diamondInit = async (
  signer: SignerWithAddress,
  diamond: ZkTrueUp,
  initContractAddr: string,
  initFactory: ContractFactory,
  initData: string
) => {
  const initFn = initFactory.interface.functions["init(bytes)"];
  const initFnSelector = initFactory.interface.getSighash(initFn);
  const initCut = [
    {
      target: initContractAddr,
      action: 0, // 0 = add, 1 = remove, 2 = replace
      selectors: [initFnSelector],
    },
  ];

  const functionCall = initFactory.interface.encodeFunctionData("init", [
    initData,
  ]);

  const initCutTx = await diamond
    .connect(signer)
    .diamondCut(initCut, initContractAddr, functionCall);

  await initCutTx.wait();
  return initFnSelector;
};

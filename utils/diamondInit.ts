import { ethers } from "hardhat";
import { ZkTrueUp } from "../typechain-types";
import { ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

/**
 * @notice diamondCut function
 * @dev initFacet is a one-time facet
 * @param signer
 * @param diamond
 * @param initContractAddr
 * @param initFactory
 * @param initData
 * @returns initFnSelector
 */
export const diamondInit = async (
  signer: SignerWithAddress,
  diamond: ZkTrueUp,
  initContractAddr: string,
  initFactory: ContractFactory,
  initData: string
) => {
  // const initFn = initFactory.interface.functions["init(bytes)"];
  // const initFnSelector = initFactory.interface.getSighash(initFn);

  const functionCall = initFactory.interface.encodeFunctionData("init", [
    initData,
  ]);

  // add init facet and execute init function
  const addInitFacetTx = await diamond
    .connect(signer)
    .diamondCut([], initContractAddr, functionCall);

  await addInitFacetTx.wait();
};

import { ZkTrueUp } from "../typechain-types";
import { ContractFactory, Signer } from "ethers";

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
  signer: Signer,
  diamond: ZkTrueUp,
  initContractAddr: string,
  initFactory: ContractFactory,
  initData: string
) => {
  const functionCall = initFactory.interface.encodeFunctionData("init", [
    initData,
  ]);

  // execute init function from init facet, only call once and not register functions
  const initTx = await diamond
    .connect(signer)
    .diamondCut([], initContractAddr, functionCall);

  await initTx.wait();
};

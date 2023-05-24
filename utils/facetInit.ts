import { BaseContract, ContractFactory, Signer } from "ethers";
import { FunctionFragment } from "ethers/lib/utils";

/**
 * @notice diamondCut function
 * @dev initFacet is a one-time facet
 * @param signer
 * @param diamond
 * @param initContractAddr
 * @param initFactory
 * @param initData
 */
export const facetInit = async (
  signer: Signer,
  diamond: BaseContract,
  initContractAddr: string,
  initFactory: ContractFactory,
  functionFragment: string | FunctionFragment,
  initData: string
) => {
  const functionCall = initFactory.interface.encodeFunctionData(
    functionFragment,
    [initData]
  );

  // execute init function from init facet, only call once and not register functions
  const initTx = await diamond
    .connect(signer)
    .diamondCut([], initContractAddr, functionCall);

  await initTx.wait();
};

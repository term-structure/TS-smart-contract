import { BaseContract, ContractFactory, Signer } from "ethers";
import { FunctionFragment } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  getExistingFacets,
  getFnSelectors,
  safeFnSelectors,
} from "./diamondHelper";
import { DIAMOND_CUT_ACTION } from "./config";

export const facetInit = async (
  signer: Signer,
  diamond: BaseContract,
  targetAddr: string,
  targetFactory: ContractFactory,
  functionFragment: string | FunctionFragment,
  initData: string,
  onlyCall: boolean
) => {
  let facets: { target: string; action: number; selectors: string[] }[] = [];
  if (!onlyCall) {
    const bytecode = await ethers.provider.getCode(targetAddr);
    if (bytecode === "0x") {
      throw new Error("Target address is not a contract");
    }
    const targetSelectors = await getFnSelectors(targetFactory);
    if (targetSelectors.length === 0) {
      throw new Error("No selectors found for target contract");
    }
    const existingFacets = await getExistingFacets(diamond.address);
    for (const existingFacet of existingFacets) {
      safeFnSelectors(targetSelectors, existingFacet);
    }
    facets = [
      {
        target: targetAddr,
        action: DIAMOND_CUT_ACTION.ADD,
        selectors: targetSelectors,
      },
    ];
  }

  const functionCall = targetFactory.interface.encodeFunctionData(
    functionFragment,
    [initData]
  );

  // execute init function from init facet, only call once and not register functions
  const initTx = await diamond
    .connect(signer)
    .diamondCut(facets, targetAddr, functionCall);

  await initTx.wait();
};

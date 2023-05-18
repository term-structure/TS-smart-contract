import { utils, BigNumber } from "ethers";
import { ZkTrueUpMock } from "../typechain-types";

export const getSlotNum = (slot: string) => {
  return BigNumber.from(utils.keccak256(utils.toUtf8Bytes(slot))).sub(1);
};

export const getStorageAt = async (contract: ZkTrueUpMock, slot: BigNumber) => {
  return await contract.getStorageAt(slot);
};

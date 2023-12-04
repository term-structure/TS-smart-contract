import { utils, BigNumber, BytesLike } from "ethers";
import { ZkTrueUpMock } from "../typechain-types";

export const getSlotNum = (slot: string) => {
  return BigNumber.from(utils.keccak256(utils.toUtf8Bytes(slot))).sub(1);
};

export const getStorageAt = async (contract: ZkTrueUpMock, slot: BigNumber) => {
  return await contract.getStorageAt(slot);
};

export const getMappingSlotNum = (key: BytesLike, slot: BytesLike) => {
  const paddedKey = utils.hexZeroPad(key, 32);
  const paddedSlot = utils.hexZeroPad(slot, 32);
  const concatenated = utils.concat([paddedKey, paddedSlot]);
  const slotNum = utils.keccak256(concatenated);
  return slotNum;
};

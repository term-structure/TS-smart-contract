import { BigNumber, utils } from "ethers";
import { poseidon } from "@big-whale-labs/poseidon";

export function genTsAddr(x: BigNumber, y: BigNumber) {
  const hashedTsPubKey = poseidon([x, y]);
  return "0x" + hashedTsPubKey.toString(16).slice(-40);
}

export function getRandomUint256() {
  const amount = utils.randomBytes(32);
  return BigNumber.from(amount);
}

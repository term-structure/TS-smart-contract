import { utils } from "ethers";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";

export const ETH_ASSET_CONFIG = {
  isStableCoin: false,
  isTsbToken: false,
  decimals: 18,
  minDepositAmt: utils.parseEther("0.01"),
  tokenAddr: DEFAULT_ETH_ADDRESS,
  priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
};

export const GENESIS_STATE_ROOT =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";

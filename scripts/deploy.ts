import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BytesLike, ethers } from "ethers";

export const deploy = async () => {};

deploy().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

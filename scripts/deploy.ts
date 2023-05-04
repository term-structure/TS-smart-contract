import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

export const deploy = async () => {};

deploy().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

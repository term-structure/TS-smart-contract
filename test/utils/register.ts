import { ethers } from "hardhat";
import { BigNumber, Signer } from "ethers";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";
import { AccountFacet, ERC20Mock } from "../../typechain-types";
import { BaseTokenAddresses } from "../../utils/type";
import { getRandomUint256 } from "./helper";

export async function register(
  sender: Signer,
  tokenId: number,
  amount: BigNumber,
  baseTokenAddresses: BaseTokenAddresses,
  diamondAcc: AccountFacet
) {
  const tokenAddr = baseTokenAddresses[tokenId];
  const l1Token = (await ethers.getContractAt(
    "ERC20Mock",
    tokenAddr
  )) as ERC20Mock;
  const pubKey = { X: getRandomUint256(), Y: getRandomUint256() };
  if (tokenId === 1) {
    const tokenAddr = DEFAULT_ETH_ADDRESS;
    await (
      await diamondAcc
        .connect(sender)
        .register(pubKey.X, pubKey.Y, tokenAddr, amount, { value: amount })
    ).wait();
  } else {
    await (
      await l1Token.connect(sender).mint(await sender.getAddress(), amount)
    ).wait();
    await (
      await l1Token.connect(sender).approve(diamondAcc.address, amount)
    ).wait();
    await (
      await diamondAcc
        .connect(sender)
        .register(pubKey.X, pubKey.Y, tokenAddr, amount)
    ).wait();
  }
}

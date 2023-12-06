import { ethers } from "hardhat";
import { BigNumber, Signer, Wallet } from "ethers";
import {
  DEFAULT_ETH_ADDRESS,
  getTsRollupSignerFromWallet,
} from "term-structure-sdk";
import { AccountFacet, ERC20Mock } from "../../typechain-types";
import { BaseTokenAddresses } from "../../utils/type";

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

  const chainId = Number((await sender.getChainId()).toString());
  const tsSigner = await getTsRollupSignerFromWallet(
    chainId,
    diamondAcc.address,
    sender as Wallet
  );
  const tsPubKey = {
    X: tsSigner.tsPubKey[0].toString(),
    Y: tsSigner.tsPubKey[1].toString(),
  };

  if (tokenId === 1) {
    const tokenAddr = DEFAULT_ETH_ADDRESS;
    await (
      await diamondAcc
        .connect(sender)
        .register(tsPubKey.X, tsPubKey.Y, tokenAddr, amount, { value: amount })
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
        .register(tsPubKey.X, tsPubKey.Y, tokenAddr, amount)
    ).wait();
  }
}

import { Signer } from "ethers";
import { GovernanceFacet, TokenFacet } from "../../typechain-types";
import { BaseTokenAddr, PriceFeed } from "../../utils/type";
import { baseTokensJSON } from "../data/baseTokens";

export async function whiteListBaseTokens(
  baseTokensAddr: BaseTokenAddr,
  priceFeeds: PriceFeed,
  diamondToken: TokenFacet,
  operator: Signer
) {
  // WBTC USDT USDC DAI
  for (let i = 1; i < baseTokensJSON.length; i++) {
    const tokenId = baseTokensJSON[i].tokenId;
    const addr = baseTokensAddr[tokenId];
    const isStableCoin = baseTokensJSON[i].isStableCoin;
    const minDepositAmt = baseTokensJSON[i].minDepositAmt;
    const decimals = baseTokensJSON[i].decimals;
    const priceFeed = priceFeeds[tokenId];
    const assetConfig = {
      isStableCoin: isStableCoin,
      isTsbToken: false,
      decimals: decimals,
      minDepositAmt: minDepositAmt,
      tokenAddr: addr,
      priceFeed: priceFeed,
    };

    await diamondToken.connect(operator).addToken(assetConfig);
  }
}

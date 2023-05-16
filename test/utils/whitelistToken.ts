import { BigNumber, Signer } from "ethers";
import { TokenFacet, TsbFacet, TsbMock, TsbToken } from "../../typechain-types";
import { baseTokensJSON } from "../data/baseTokens";
import { BaseTokenAddresses, PriceFeeds, TsbTokenData } from "../../utils/type";
import { ethers } from "hardhat";
import { DEFAULT_ZERO_ADDR } from "../../utils/config";

export async function whiteListBaseTokens(
  baseTokenAddresses: BaseTokenAddresses,
  priceFeeds: PriceFeeds,
  diamondToken: TokenFacet,
  operator: Signer
) {
  // WBTC USDT USDC DAI
  for (let i = 1; i < baseTokensJSON.length; i++) {
    const tokenId = baseTokensJSON[i].tokenId;
    const addr = baseTokenAddresses[tokenId];
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

export const createAndWhiteListTsbToken = async (
  diamondToken: TokenFacet,
  diamondTsb: TsbFacet | TsbMock,
  operator: Signer,
  tsbTokenData: TsbTokenData
) => {
  const underlyingTokenId = tsbTokenData.underlyingTokenId;
  const maturity = BigNumber.from(tsbTokenData.maturity);
  const name = tsbTokenData.name;
  const symbol = tsbTokenData.symbol;

  // create tsb token
  const createTsbTokenTx = await diamondTsb
    .connect(operator)
    .createTsbToken(underlyingTokenId, maturity, name, symbol);
  const createTsbTokenReceipt = await createTsbTokenTx.wait();
  const addr = createTsbTokenReceipt.events?.[0].args?.[0];

  // whitelist tsb token
  const tsbTokenAddr = await diamondTsb.getTsbTokenAddr(
    underlyingTokenId,
    maturity
  );
  const tsbToken = (await ethers.getContractAt(
    "TsbToken",
    tsbTokenAddr
  )) as TsbToken;
  const assetConfig = {
    isStableCoin: tsbTokenData.isStableCoin,
    isTsbToken: true,
    decimals: await tsbToken.decimals(),
    minDepositAmt: tsbTokenData.minDepositAmt,
    tokenAddr: tsbTokenAddr,
    priceFeed: DEFAULT_ZERO_ADDR,
  };
  await diamondToken.connect(operator).addToken(assetConfig);
};

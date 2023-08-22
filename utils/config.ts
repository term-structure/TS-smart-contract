import { utils } from "ethers";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";

export const DIAMOND_CUT_ACTION = {
  ADD: 0,
  REPLACE: 1,
  REMOVE: 2,
};

export const MAINNET_ADDRESS = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  ETH_PRICE_FEED: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  WBTC_PRICE_FEED: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
  USDT_PRICE_FEED: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
  USDC_PRICE_FEED: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
  DAI_PRICE_FEED: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
  AAVE_V3_POOL_DATA_PROVIDER: "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3",
};

export const INIT_FUNCTION_NAME = "init";

export const LIBRARY_NAMES = [
  "AccountLib",
  "AddressLib",
  "FlashLoanLib",
  "ProtocolParamsLib",
  "LoanLib",
  "RollupLib",
  "TokenLib",
  "TsbLib",
];

export const FACET_NAMES = [
  "AccountFacet",
  "AddressFacet",
  "FlashLoanFacet",
  "ProtocolParamsFacet",
  "LoanFacet",
  "RollupFacet",
  "TokenFacet",
  "TsbFacet",
];

export const DEFAULT_ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export const ETH_ASSET_CONFIG = {
  isStableCoin: false,
  isTsbToken: false,
  decimals: 18,
  minDepositAmt: utils.parseEther("0.01"),
  tokenAddr: DEFAULT_ETH_ADDRESS,
  priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
};

export const BASE_TOKEN_ASSET_CONFIG = [
  {
    name: "ETH",
    symbol: "ETH",
    isStableCoin: false,
    tokenId: 1,
    decimals: 18,
    minDepositAmt: utils.parseUnits("0.01", 18),
    priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // mainnet
  },
  {
    name: "WBTC",
    symbol: "WBTC",
    isStableCoin: false,
    tokenId: 2,
    decimals: 8,
    minDepositAmt: utils.parseUnits("0.0001", 8),
    priceFeed: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", // mainnet
  },
  {
    name: "USDT",
    symbol: "USDT",
    isStableCoin: true,
    tokenId: 3,
    decimals: 6,
    minDepositAmt: utils.parseUnits("10", 6),
    priceFeed: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", // mainnet
  },
  {
    name: "USDC",
    symbol: "USDC",
    isStableCoin: true,
    tokenId: 4,
    decimals: 6,
    minDepositAmt: utils.parseUnits("10", 6),
    priceFeed: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // mainnet
  },
  {
    name: "DAI",
    symbol: "DAI",
    isStableCoin: true,
    tokenId: 5,
    decimals: 18,
    minDepositAmt: utils.parseUnits("10", 18),
    priceFeed: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9", // mainnet
  },
];

export const DEFAULT_GENESIS_STATE_ROOT =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";

export const MAX_LTV_RATIO = 1000; // 100%

export const BYTES_OF_CHUNK = 12;

export const NOOP_BYTES = 1;

export const REGISTER_BYTES = 3 * BYTES_OF_CHUNK;

export const DEPOSIT_BYTES = 2 * BYTES_OF_CHUNK;

export const WITHDRAW_BYTES = 3 * BYTES_OF_CHUNK;

export const FORCE_WITHDRAW_BYTES = 2 * BYTES_OF_CHUNK;

export const AUCTION_END_BYTES = 4 * BYTES_OF_CHUNK;

export const WITHDRAW_FEE_BYTES = 2 * BYTES_OF_CHUNK;

export const EVACUATION_BYTES = 2 * BYTES_OF_CHUNK;

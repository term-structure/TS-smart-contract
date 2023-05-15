import { utils } from "ethers";
import { DEFAULT_ETH_ADDRESS } from "term-structure-sdk";

export const LIB_NAMES = [
  "AccountLib",
  "AddressLib",
  "FlashLoanLib",
  "GovernanceLib",
  "LoanLib",
  "RollupLib",
  "TokenLib",
  "TsbLib",
];

export const FACET_NAMES = [
  "AccountFacet",
  "AddressFacet",
  "FlashLoanFacet",
  "GovernanceFacet",
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

export const GENESIS_STATE_ROOT =
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";

export const MAX_LTV_RATIO = 1000; // 100%

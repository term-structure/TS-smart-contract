import { utils } from 'ethers';

export const baseTokensJSON = [
  {
    name: 'ETH',
    symbol: 'ETH',
    isStableCoin: false,
    tokenId: 1,
    decimals: 18,
    minDepositAmt: utils.parseUnits('0.01', 18),
    priceFeed: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // mainnet
  },
  {
    name: 'WBTC',
    symbol: 'WBTC',
    isStableCoin: false,
    tokenId: 2,
    decimals: 8,
    minDepositAmt: utils.parseUnits('0.0001', 8),
    priceFeed: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', // mainnet
  },
  {
    name: 'USDT',
    symbol: 'USDT',
    isStableCoin: true,
    tokenId: 3,
    decimals: 6,
    minDepositAmt: utils.parseUnits('10', 6),
    priceFeed: '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D', // mainnet
  },
  {
    name: 'USDC',
    symbol: 'USDC',
    isStableCoin: true,
    tokenId: 4,
    decimals: 6,
    minDepositAmt: utils.parseUnits('10', 6),
    priceFeed: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6', // mainnet
  },
  {
    name: 'DAI',
    symbol: 'DAI',
    isStableCoin: true,
    tokenId: 5,
    decimals: 18,
    minDepositAmt: utils.parseUnits('10', 18),
    priceFeed: '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9', // mainnet
  },
];

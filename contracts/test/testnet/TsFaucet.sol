// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import "./TsERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TsFaucet contract
/// @author Term Structure Labs
contract TsFaucet is Ownable {
    address public immutable zkTrueUp;

    uint8 internal constant TS_ERC20_NUMBERS = 5; // ETH WBTC USDT USDC DAI
    uint16 internal constant MINT_AMOUNT = 1000;

    string internal constant WETH_NAME = "Wrapped Ether";
    string internal constant WETH_SYMBOL = "WETH";
    uint8 internal constant WETH_DECIMALS = 18;
    string internal constant WBTC_NAME = "Wrapped Bitcoin";
    string internal constant WBTC_SYMBOL = "WBTC";
    uint8 internal constant WBTC_DECIMALS = 8;
    string internal constant USDT_NAME = "Tether USD";
    string internal constant USDT_SYMBOL = "USDT";
    uint8 internal constant USDT_DECIMALS = 6;
    string internal constant USDC_NAME = "USD Coin";
    string internal constant USDC_SYMBOL = "USDC";
    uint8 internal constant USDC_DECIMALS = 6;
    string internal constant DAI_NAME = "Dai Stablecoin";
    string internal constant DAI_SYMBOL = "DAI";
    uint8 internal constant DAI_DECIMALS = 18;

    address[TS_ERC20_NUMBERS] public tsERC20s;
    mapping(address => bool) public isMinted;

    event TsERC20Created(address indexed tokenAddress);

    event BatchMint(address indexed to);

    event DevMint(address indexed to, address indexed tokenAddress, uint256 amount);

    struct TokenInfo {
        string name;
        string symbol;
        uint8 decimals;
    }

    constructor(bytes memory data) {
        address _zkTrueUpAddr = abi.decode(data, (address));
        zkTrueUp = _zkTrueUpAddr;

        tsERC20s[0] = _createTsERC20(TokenInfo(WETH_NAME, WETH_SYMBOL, WETH_DECIMALS));
        tsERC20s[1] = _createTsERC20(TokenInfo(WBTC_NAME, WBTC_SYMBOL, WBTC_DECIMALS));
        tsERC20s[2] = _createTsERC20(TokenInfo(USDT_NAME, USDT_SYMBOL, USDT_DECIMALS));
        tsERC20s[3] = _createTsERC20(TokenInfo(USDC_NAME, USDC_SYMBOL, USDC_DECIMALS));
        tsERC20s[4] = _createTsERC20(TokenInfo(DAI_NAME, DAI_SYMBOL, DAI_DECIMALS));
    }

    function _createTsERC20(TokenInfo memory tokenInfo) internal returns (address) {
        address tsERC20Addr = address(new TsERC20(zkTrueUp, tokenInfo.name, tokenInfo.symbol, tokenInfo.decimals));
        emit TsERC20Created(tsERC20Addr);
        return tsERC20Addr;
    }

    function batchMint(address _to) external onlyOwner {
        require(!isMinted[_to], "Only mint once");
        isMinted[_to] = true;
        for (uint256 i; i < TS_ERC20_NUMBERS; i++) {
            uint8 decimals = TsERC20(tsERC20s[i]).decimals();
            uint256 amount = MINT_AMOUNT * (10 ** decimals);
            TsERC20(tsERC20s[i]).mint(_to, amount);
        }
        emit BatchMint(_to);
    }

    function devMint(address _to, address _tokenAddr, uint256 _amount) external onlyOwner {
        TsERC20(_tokenAddr).mint(_to, _amount);
        emit DevMint(_to, _tokenAddr, _amount);
    }
}

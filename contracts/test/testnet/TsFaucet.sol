// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import {ITsFaucet} from "./ITsFaucet.sol";
import "./TsERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

struct TokenMetadata {
    string name;
    string symbol;
    uint8 decimals;
}

/// @title TsFaucet contract
/// @author Term Structure Labs
contract TsFaucet is ITsFaucet, Ownable {
    address public zkTrueUp;
    address public exchange;

    uint8 internal constant TS_ERC20_NUMBERS = 5; // TSETH WBTC USDT USDC DAI
    uint16 internal constant FREE_MINT_AMOUNT = 10000;
    uint16 internal constant BATCH_MINT_AMOUNT_BASE = 1000;
    // uint24[TS_ERC20_NUMBERS] internal BATCH_MINT_AMOUNT = [5000, 250, 10000000, 10000000, 10000000];
    uint24[TS_ERC20_NUMBERS] internal BATCH_MINT_AMOUNT = [10000000, 10000000, 10000000, 10000000, 10000000];

    TokenMetadata internal _tseth = TokenMetadata("Term Structure Ether", "TSETH", 18);
    TokenMetadata internal _wbtc = TokenMetadata("Wrapped Bitcoin", "WBTC", 8);
    TokenMetadata internal _usdt = TokenMetadata("Tether USD", "USDT", 6);
    TokenMetadata internal _usdc = TokenMetadata("USD Coin", "USDC", 6);
    TokenMetadata internal _dai = TokenMetadata("Dai Stablecoin", "DAI", 18);

    bool public transferEnabled;
    bool internal _isFreeMint;
    address[TS_ERC20_NUMBERS] public tsERC20s;
    mapping(address => bool) public isMinted;

    constructor(address _zkTrueUpAddr, address _exchangeAddr) {
        zkTrueUp = _zkTrueUpAddr;
        exchange = _exchangeAddr;
        tsERC20s[0] = _createTsERC20(_tseth);
        tsERC20s[1] = _createTsERC20(_wbtc);
        tsERC20s[2] = _createTsERC20(_usdt);
        tsERC20s[3] = _createTsERC20(_usdc);
        tsERC20s[4] = _createTsERC20(_dai);
    }

    function setZkTrueUp(address _zkTrueUpAddr) external onlyOwner {
        zkTrueUp = _zkTrueUpAddr;
    }

    function setExchange(address _exchangeAddr) external onlyOwner {
        exchange = _exchangeAddr;
    }

    function setTransferEnabled(bool _transferEnabled) external onlyOwner {
        transferEnabled = _transferEnabled;
    }

    function _createTsERC20(TokenMetadata memory tokenMetadata) internal returns (address) {
        address tsERC20Addr = address(new TsERC20(tokenMetadata.name, tokenMetadata.symbol, tokenMetadata.decimals));
        emit TsERC20Created(tsERC20Addr);
        return tsERC20Addr;
    }

    function batchMint(address _to) external onlyOwner {
        require(!isMinted[_to], "Only mint once");
        isMinted[_to] = true;
        for (uint256 i; i < TS_ERC20_NUMBERS; i++) {
            uint8 decimals = TsERC20(tsERC20s[i]).decimals();
            uint256 amount = (BATCH_MINT_AMOUNT[i] * (10 ** decimals)) / BATCH_MINT_AMOUNT_BASE;
            TsERC20(tsERC20s[i]).mint(_to, amount);
        }
        emit BatchMint(_to);
    }

    function devMint(address _to, address _tokenAddr, uint256 _amount) external onlyOwner {
        TsERC20(_tokenAddr).mint(_to, _amount);
        emit DevMint(_to, _tokenAddr, _amount);
    }

    function batchFreeMint() external {
        require(_isFreeMint, "Not free mint now");
        for (uint256 i; i < TS_ERC20_NUMBERS; i++) {
            uint8 decimals = TsERC20(tsERC20s[i]).decimals();
            uint256 amount = FREE_MINT_AMOUNT * (10 ** decimals);
            TsERC20(tsERC20s[i]).mint(msg.sender, amount);
        }
        emit BatchFreeMint(msg.sender);
    }

    function setFreeMint(bool isFreeMint) external onlyOwner {
        _isFreeMint = isFreeMint;
        emit SetFreeMint(isFreeMint);
    }

    function exchangeMint(address _to, address _tokenAddr, uint256 _amount) external {
        require(msg.sender == exchange, "Only exchange contract");
        TsERC20(_tokenAddr).mint(_to, _amount);
        emit ExchangeMint(_to, _tokenAddr, _amount);
    }
}

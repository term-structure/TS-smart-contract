// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import "./TsERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

struct TokenMetadata {
    string name;
    string symbol;
    uint8 decimals;
}

/// @title TsFaucet contract
/// @author Term Structure Labs
contract TsFaucet is Ownable {
    address public immutable zkTrueUp;
    address public immutable exchange;

    uint8 internal constant TS_ERC20_NUMBERS = 5; // ETH WBTC USDT USDC DAI
    uint16 internal constant MINT_AMOUNT = 1000;

    TokenMetadata internal _weth = TokenMetadata("Wrapped Ether", "WETH", 18);
    TokenMetadata internal _wbtc = TokenMetadata("Wrapped Bitcoin", "WBTC", 8);
    TokenMetadata internal _usdt = TokenMetadata("Tether USD", "USDT", 6);
    TokenMetadata internal _usdc = TokenMetadata("USD Coin", "USDC", 6);
    TokenMetadata internal _dai = TokenMetadata("Dai Stablecoin", "DAI", 18);

    bool internal _isFreeMint;
    address[TS_ERC20_NUMBERS] public tsERC20s;
    mapping(address => bool) public isMinted;

    event TsERC20Created(address indexed tokenAddr);

    event BatchMint(address indexed to);

    event DevMint(address indexed to, address indexed tokenAddr, uint256 amount);

    event SetFreeMint(bool indexed isFreeMint);

    event ExchangeMint(address indexed to, address indexed tokenAddr, uint256 amount);

    constructor(address _zkTrueUpAddr, address _exchangeAddr) {
        zkTrueUp = _zkTrueUpAddr;
        exchange = _exchangeAddr;
        tsERC20s[0] = _createTsERC20(_weth);
        tsERC20s[1] = _createTsERC20(_wbtc);
        tsERC20s[2] = _createTsERC20(_usdt);
        tsERC20s[3] = _createTsERC20(_usdc);
        tsERC20s[4] = _createTsERC20(_dai);
    }

    function _createTsERC20(TokenMetadata memory tokenMetadata) internal returns (address) {
        address tsERC20Addr = address(
            new TsERC20(zkTrueUp, exchange, tokenMetadata.name, tokenMetadata.symbol, tokenMetadata.decimals)
        );
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

    function batchFreeMint() external {
        require(_isFreeMint, "Not free mint now");
        for (uint256 i; i < TS_ERC20_NUMBERS; i++) {
            uint8 decimals = TsERC20(tsERC20s[i]).decimals();
            uint256 amount = MINT_AMOUNT * (10 ** decimals);
            TsERC20(tsERC20s[i]).mint(msg.sender, amount);
        }
        emit BatchMint(msg.sender);
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

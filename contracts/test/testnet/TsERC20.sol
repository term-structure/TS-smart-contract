// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TsERC20 is ERC20 {
    address public immutable tsFaucet;
    address public immutable zkTrueUp;
    address public immutable exchange;
    uint8 private immutable _decimals;

    constructor(
        address zkTrueUpAddr,
        address exchangeAddr,
        string memory name_,
        string memory symbol_,
        uint8 dec_
    ) ERC20(name_, symbol_) {
        tsFaucet = _msgSender();
        zkTrueUp = zkTrueUpAddr;
        exchange = exchangeAddr;
        _decimals = dec_;
    }

    function mint(address to, uint256 amount) external {
        require(tsFaucet == _msgSender(), "Only TsFaucet can mint");
        _mint(to, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}

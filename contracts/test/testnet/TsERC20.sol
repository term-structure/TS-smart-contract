// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ITsFaucet} from "./ITsFaucet.sol";

contract TsERC20 is ERC20 {
    address public immutable tsFaucet;
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 dec_) ERC20(name_, symbol_) {
        tsFaucet = _msgSender();
        _decimals = dec_;
    }

    function mint(address to, uint256 amount) external {
        require(tsFaucet == _msgSender(), "Only TsFaucet can mint");
        _mint(to, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        ITsFaucet faucet = ITsFaucet(tsFaucet);
        if (!faucet.transferEnabled())
            require(spender == faucet.zkTrueUp() || spender == faucet.exchange(), "Invalid spender");
        return super.approve(spender, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal view override {
        ITsFaucet faucet = ITsFaucet(tsFaucet);
        if (!faucet.transferEnabled())
            if (to != faucet.zkTrueUp() && to != faucet.exchange()) {
                require(from == faucet.zkTrueUp() || from == address(0), "Invalid recipient");
            }
    }
}

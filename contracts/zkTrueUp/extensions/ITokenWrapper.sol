// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title The interface of the Token Wrapper contract
 * @author Term Structure Labs
 * @notice This interface of the Token Wrapper contract
 */
interface ITokenWrapper is IERC20 {
    function underlying() external view returns (IERC20);

    function depositFor(address account, uint256 amount) external returns (bool);

    function withdrawTo(address account, uint256 amount) external returns (bool);
}

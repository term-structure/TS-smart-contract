// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
  * @title Term Structure Bond Token Contract
  * @author Term Structure Labs
  * @notice The Term Structure Bond Token (tsbToken) is an ERC20 token 
            that represents a bond with a fixed maturity time.
 */
contract TsbToken is ERC20 {
    /// @notice Error for only ZkTrueUp contract can call
    error OnlyZkTrueUp();
    /// @notice The address of the ZkTrueUp contract
    address public immutable zkTrueUp;
    /// @notice The underlying asset of the TSB token
    address public immutable underlyingAsset;
    /// @notice The maturity time of the TSB token
    uint32 public immutable maturityTime;

    /// @notice The constructor of the TSB token contract
    /// @param name_ The name of the TSB token
    /// @param symbol_ The symbol of the TSB token
    /// @param underlyingAsset_ The underlying asset of the TSB token
    /// @param maturityTime_ The maturity time of the TSB token
    constructor(
        string memory name_,
        string memory symbol_,
        address underlyingAsset_,
        uint32 maturityTime_
    ) ERC20(name_, symbol_) {
        zkTrueUp = msg.sender;
        underlyingAsset = underlyingAsset_;
        maturityTime = maturityTime_;
    }

    /// @notice Only ZkTrueUp modifier
    modifier onlyZkTrueUp() {
        if (_msgSender() != zkTrueUp) revert OnlyZkTrueUp();
        _;
    }

    /// @notice Mint TSB token
    /// @dev Only TsbFactory can mint
    /// @param account The address of the account
    /// @param amount The amount of the TSB token
    function mint(address account, uint256 amount) external onlyZkTrueUp {
        _mint(account, amount);
    }

    /// @notice Burn TSB token
    /// @dev Only TsbFactory can burn
    /// @param account The address of the account
    /// @param amount The amount of the TSB token
    function burn(address account, uint256 amount) external onlyZkTrueUp {
        _burn(account, amount);
    }

    /// @notice Check if the TSB token is matured
    /// @return isMatured True if the TSB token is matured
    function isMatured() external view returns (bool) {
        return block.timestamp >= uint256(maturityTime);
    }

    /// @notice Get the underlying asset and maturity time of the TSB token
    /// @return underlyingAsset The underlying asset of the TSB token
    /// @return maturityTime The maturity time of the TSB token
    function tokenInfo() external view returns (address, uint32) {
        return (underlyingAsset, maturityTime);
    }

    /// @notice Get the decimals of the TSB token
    /// @dev The decimals of the TSB token is 8
    /// @return decimals The decimals of the TSB toke
    function decimals() public pure override returns (uint8) {
        return 8;
    }
}

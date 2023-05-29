// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/ITsbToken.sol";

/**
  * @title Term Structure Bond Token Contract
  * @author Term Structure Labs
  * @notice The Term Structure Bond Token (tsbToken) is an ERC20 token 
            that represents a bond with a fixed maturity time.
 */
contract TsbToken is ERC20, ITsbToken {
    /// @notice Error for only ZkTrueUp contract can call
    error OnlyZkTrueUp();
    /**
     * @inheritdoc ITsbToken
     */
    address public immutable zkTrueUp;
    /// @notice The underlying asset of the TSB token
    address private immutable _underlyingAsset;
    /// @notice The maturity time of the TSB token
    uint32 private immutable _maturityTime;

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
        _underlyingAsset = underlyingAsset_;
        _maturityTime = maturityTime_;
    }

    /// @notice Only ZkTrueUp modifier
    modifier onlyZkTrueUp() {
        if (_msgSender() != zkTrueUp) revert OnlyZkTrueUp();
        _;
    }

    /**
     * @inheritdoc ITsbToken
     */
    function mint(address account, uint256 amount) external onlyZkTrueUp {
        _mint(account, amount);
    }

    /**
     * @inheritdoc ITsbToken
     */
    function burn(address account, uint256 amount) external onlyZkTrueUp {
        _burn(account, amount);
    }

    /**
     * @inheritdoc ITsbToken
     */
    function isMatured() external view returns (bool) {
        return block.timestamp >= uint256(_maturityTime);
    }

    /**
     * @inheritdoc ITsbToken
     */
    function tokenInfo() external view returns (address, uint32) {
        return (_underlyingAsset, _maturityTime);
    }

    /// @notice Get the decimals of the TSB token
    /// @dev The decimals of the TSB token is 8
    /// @return decimals The decimals of the TSB toke
    function decimals() public pure override returns (uint8) {
        return 8;
    }
}

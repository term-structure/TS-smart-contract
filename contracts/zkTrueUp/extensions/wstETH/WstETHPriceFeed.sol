// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IWstETH} from "./IWstETH.sol";

/**
 * @title The customized wstETH price feed contract mutated from Chainlink AggregatorV3Interface
 * @author Term Structure Labs
 * @notice Use the customized price feed contract to normalized price feed interface for Term Structure Protocol
 */
contract WstETHPriceFeed is AggregatorV3Interface {
    using SafeCast for uint256;
    // The stETH price feed contract from Chainlink
    AggregatorV3Interface internal immutable _stETHPriceFeed;

    // The Lido WstETH contract
    // (see https://docs.lido.fi/contracts/wsteth/)
    IWstETH internal immutable _wstETH;
    int256 internal constant STETH_PER_WSTETH_DECIMALS = 1e18;

    // error to call `getRoundData` function
    error GetRoundDataNotSupported();

    /// @notice WstETHPriceFeed constructor
    /// @param wstETH The Lido WstETH contract
    /// @param stETHPriceFeed The stETH price feed contract from Chainlink
    constructor(IWstETH wstETH, AggregatorV3Interface stETHPriceFeed) {
        _wstETH = wstETH;
        _stETHPriceFeed = stETHPriceFeed;
    }

    /**
     * @notice Revert this function because cannot get the chi (rate accumulator) at a specific round
     */
    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        // error to call this function because cannot get the stETH/wstETH ratio at a specific round
        revert GetRoundDataNotSupported();
    }

    /**
     * @notice Get the latest round data from chainlink and calculate the wstETH price by multiplying stETH/wstETH ratio
     * @return roundId The round ID
     * @return answer The calculated wstETH price
     * @return startedAt Timestamp of when the round started
     * @return updatedAt Timestamp of when the round was updated
     * @return answeredInRound The round ID of the round in which the answer was computed
     */
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        // wstETH price = stETH price * stETHPerWstETH / STETH_PER_WSTETH_DECIMALS
        (roundId, answer, startedAt, updatedAt, answeredInRound) = _stETHPriceFeed.latestRoundData();
        answer = (answer * _wstETH.stEthPerToken().toInt256()) / STETH_PER_WSTETH_DECIMALS;
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }

    /** ========== Return original chainlink data ========== */

    function decimals() external view returns (uint8) {
        return _stETHPriceFeed.decimals();
    }

    function description() external view returns (string memory) {
        return _stETHPriceFeed.description();
    }

    function version() external view returns (uint256) {
        return _stETHPriceFeed.version();
    }
}

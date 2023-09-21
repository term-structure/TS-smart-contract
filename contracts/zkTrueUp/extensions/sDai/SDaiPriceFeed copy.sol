// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IPot} from "./IPot.sol";

/**
 * @title The customized sDai price feed contract mutated from Chainlink AggregatorV3Interface
 * @author Term Structure Labs
 * @notice Use the customized price feed contract to normalized price feed interface for Term Structure Protocol
 */
contract SDaiPriceFeed is AggregatorV3Interface {
    using SafeCast for uint256;
    // The stETH price feed contract from Chainlink
    AggregatorV3Interface internal immutable _daiPriceFeed;

    // The MakerDAO Pot contract
    // (see https://docs.makerdao.com/smart-contract-modules/rates-module/pot-detailed-documentation)
    IPot internal immutable _pot;
    int256 internal constant CHI_DECIMALS = 1e27; // chi (rate accumulator) decimals

    // error to call `getRoundData` function
    error GetRoundDataNotSupported();

    /// @notice SDaiPriceFeed constructor
    /// @param pot The MakerDAO Pot contract
    /// @param daiPriceFeed The Dai price feed contract from Chainlink
    constructor(IPot pot, AggregatorV3Interface daiPriceFeed) {
        _pot = pot;
        _daiPriceFeed = daiPriceFeed;
    }

    /**
     * @inheritdoc AggregatorV3Interface
     */
    function decimals() external view returns (uint8) {
        return _daiPriceFeed.decimals();
    }

    /**
     * @inheritdoc AggregatorV3Interface
     */
    function description() external view returns (string memory) {
        return _daiPriceFeed.description();
    }

    /**
     * @inheritdoc AggregatorV3Interface
     */
    function version() external view returns (uint256) {
        return _daiPriceFeed.version();
    }

    /**
     * @inheritdoc AggregatorV3Interface
     */
    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        // error to call this function because cannot get the chi (rate accumulator) at a specific round
        revert GetRoundDataNotSupported();
    }

    /**
     * @inheritdoc AggregatorV3Interface
     */
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        // sDai price = dai price * chi (rate accumulator) / CHI_DECIMALS
        (roundId, answer, startedAt, updatedAt, answeredInRound) = _daiPriceFeed.latestRoundData();
        answer = (answer * _pot.chi().toInt256()) / CHI_DECIMALS;
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}

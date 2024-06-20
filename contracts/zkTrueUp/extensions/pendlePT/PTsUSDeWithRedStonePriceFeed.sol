// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {PendlePYLpOracle} from "@pendle/core-v2/contracts/oracles/PendlePYLpOracle.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract PTsUSDeWithRedStonePriceFeed is AggregatorV3Interface {
    using Math for uint256;
    using SafeCast for *;

    PendlePYLpOracle public immutable ORACLE;
    address public immutable MARKET;
    uint32 public immutable DURATION;
    AggregatorV3Interface public immutable REDSTONE_PRICE_FEED;

    // error to call `getRoundData` function
    error GetRoundDataNotSupported();

    constructor(
        address pendlePYLpOracleAddr,
        address market,
        uint32 duration,
        AggregatorV3Interface redStonePriceFeed
    ) {
        ORACLE = PendlePYLpOracle(pendlePYLpOracleAddr);
        MARKET = market;
        DURATION = duration;
        REDSTONE_PRICE_FEED = redStonePriceFeed;
    }

    /**
     * @notice Revert this function because cannot get the chi (rate accumulator) at a specific round
     */
    function getRoundData(
        uint80 /* _roundId */
    )
        external
        pure
        returns (
            uint80 /* roundId */,
            int256 /* answer */,
            uint256 /* startedAt */,
            uint256 /* updatedAt */,
            uint80 /* answeredInRound */
        )
    {
        // error to call this function because cannot get the chi (rate accumulator) at a specific round
        revert GetRoundDataNotSupported();
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        // PT price = PT rate in underlying * underlying price / 10^decimals
        uint256 ptRateInUnderlying = ORACLE.getPtToAssetRate(MARKET, DURATION);

        (roundId, answer, startedAt, updatedAt, answeredInRound) = REDSTONE_PRICE_FEED.latestRoundData();
        answer = ptRateInUnderlying.mulDiv(answer.toUint256(), 10 ** REDSTONE_PRICE_FEED.decimals()).toInt256();

        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }

    /** ========== Return original redstone data ========== */

    function decimals() external view returns (uint8) {
        return REDSTONE_PRICE_FEED.decimals();
    }

    function description() external view returns (string memory) {
        return REDSTONE_PRICE_FEED.description();
    }

    function version() external view returns (uint256) {
        return REDSTONE_PRICE_FEED.version();
    }
}

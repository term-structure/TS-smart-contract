// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {PendlePYLpOracle} from "@pendle/core-v2/contracts/oracles/PendlePYLpOracle.sol";
import {PendlePYOracleLib} from "@pendle/core-v2/contracts/oracles/PendlePYOracleLib.sol";
import {IPMarket} from "@pendle/core-v2/contracts/interfaces/IPMarket.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title The customized Pendle PT price feed contract mutated from Chainlink AggregatorV3Interface
 * @author Term Structure Labs
 * @notice Use the customized price feed contract to normalized price feed interface for Term Structure Protocol
 */
contract PTWithRedStonePriceFeed is AggregatorV3Interface {
    using Math for uint256;
    using SafeCast for *;
    using PendlePYOracleLib for IPMarket;

    // Pendle PY LP oracle, refer to `https://docs.pendle.finance/Developers/Oracles/HowToIntegratePtAndLpOracle`
    PendlePYLpOracle public immutable PY_LP_ORACLE;
    // Pendle market
    IPMarket public immutable MARKET;
    // TWAP duration
    uint32 public immutable DURATION;
    // PT to asset rate base (i.e. 1e18 for decimals 18)
    uint256 internal immutable PT_TO_ASSET_RATE_BASE;
    // RedStone price feed interface
    AggregatorV3Interface public immutable REDSTONE_PRICE_FEED;

    // error to call `getRoundData` function
    error GetRoundDataNotSupported();
    // error when Pendle PY LP oracle is not ready
    error OracleIsNotReady();

    constructor(
        PendlePYLpOracle pendlePYLpOracle,
        IPMarket market,
        uint32 duration,
        uint256 ptToAssetRateBase,
        AggregatorV3Interface redStonePriceFeed
    ) {
        PY_LP_ORACLE = pendlePYLpOracle;
        MARKET = market;
        DURATION = duration;
        PT_TO_ASSET_RATE_BASE = ptToAssetRateBase;
        REDSTONE_PRICE_FEED = redStonePriceFeed;

        if (!_oracleIsReady()) revert OracleIsNotReady();
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

    /**
     * @notice Get the latest round data from chainlink and calculate the PT price by multiplying PT rate in SY and SY price
     * @return roundId The round ID
     * @return answer The calculated PT price
     * @return startedAt Timestamp of when the round started
     * @return updatedAt Timestamp of when the round was updated
     * @return answeredInRound The round ID of the round in which the answer was computed
     */
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        // PT price = PT rate in SY * SY price / PT to asset rate base
        uint256 ptRateInSy = MARKET.getPtToSyRate(DURATION); // PT -> SY

        (roundId, answer, startedAt, updatedAt, answeredInRound) = REDSTONE_PRICE_FEED.latestRoundData();
        answer = ptRateInSy.mulDiv(answer.toUint256(), PT_TO_ASSET_RATE_BASE).toInt256();

        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }

    /**
     * @notice Check if the Pendle PY LP oracle is ready
     * @return True if the oracle is ready, otherwise false
     */
    function _oracleIsReady() internal view returns (bool) {
        (bool increaseCardinalityRequired, , bool oldestObservationSatisfied) = PY_LP_ORACLE.getOracleState(
            address(MARKET),
            DURATION
        );

        return !increaseCardinalityRequired && oldestObservationSatisfied;
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

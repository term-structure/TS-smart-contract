// SPDX-License-Identifier: MIT
// solhint-disable-next-line
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract OracleMock is AggregatorV3Interface, Ownable {
    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    RoundData private _latestRoundData;

    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);

    function decimals() external pure override returns (uint8) {
        return 8;
    }

    function description() external pure override returns (string memory) {
        return "Test Oracle";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        pure
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (0, 0, 0, 0, 0);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (
            _latestRoundData.roundId,
            _latestRoundData.answer,
            _latestRoundData.startedAt,
            _latestRoundData.updatedAt,
            _latestRoundData.answeredInRound
        );
    }

    function updateRoundData(RoundData memory roundData) external onlyOwner {
        _latestRoundData = roundData;
        emit AnswerUpdated(roundData.answer, roundData.roundId, roundData.updatedAt);
    }
}

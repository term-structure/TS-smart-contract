// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IRollerFacet {
    event RollToAave(
        bytes12 indexed loanId,
        address indexed sender,
        address collateralTokenAddr,
        address debtTokenAddr,
        uint128 collateralAmt,
        uint128 debtAmt
    );

    function rollToAave(bytes12 loanId, uint128 collateralAmt, uint128 debtAmt) external;
}

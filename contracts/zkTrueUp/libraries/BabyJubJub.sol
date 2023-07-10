// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// Point representation in affine form
struct Point {
    uint256 x;
    uint256 y;
}

/**
 * @dev BabyJubJub curve operations
 * @notice Original source code: https://github.com/mesquka/babyjubjub-solidity/blob/main/contracts/LibBabyJubJub.sol
 */
library BabyJubJub {
    // Curve parameters
    // E: A^2 + y^2 = 1 + Dx^2y^2 (mod Q)
    uint256 internal constant A = 168700;
    uint256 internal constant D = 168696;
    uint256 internal constant Q = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /**
     * @dev Check if a BabyJubJub point is on the curve
     * (168700x^2 + y^2) = (1 + 168696x^2y^2)
     * @param _point point to check
     * @return is on curve
     */
    function isOnCurve(Point memory _point) internal pure returns (bool) {
        uint256 xSq = mulmod(_point.x, _point.x, Q);
        uint256 ySq = mulmod(_point.y, _point.y, Q);

        uint256 lhs = addmod(mulmod(A, xSq, Q), ySq, Q);
        uint256 rhs = addmod(1, mulmod(mulmod(D, xSq, Q), ySq, Q), Q);

        return submod(lhs, rhs) == 0;
    }

    /**
     * @dev Modular subtract (mod n).
     * @param _a The first number
     * @param _b The number to be subtracted
     * @return result
     */
    function submod(uint256 _a, uint256 _b) internal pure returns (uint256) {
        return addmod(_a, Q - _b, Q);
    }
}

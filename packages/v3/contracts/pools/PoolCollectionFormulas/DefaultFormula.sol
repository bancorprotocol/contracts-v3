// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { SafeMath, SafeCast, MathEx, Output, M } from "./Common.sol";

/**
 * @dev this library provides mathematical support for base token withdrawal
 */
library DefaultFormula {
    using SafeMath for uint256;
    using SafeCast for uint256;

    /**
     * @dev returns:
     * `p = ax(1-n)/(b+c)`
     * `q = ax(1-n)/(b+c)`
     * `r = bx(1-n)/(b+c)`
     * `s = x(1-n)`
     * `t = 0`
     */
    function surplus(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) { unchecked {
        validate(a, b, c, e, n, x, false);
        uint256 y = (b + c) * M;
        uint256 z = x * (M - n);
        output.p = MathEx.mulDivF(a, z, y).toInt256(); // ax(1-n)/(b+c)
        output.r = MathEx.mulDivF(b, z, y);            // bx(1-n)/(b+c)
        output.s = z / M;                              // x(1-n)
        output.t = 0;                                  // 0
        output.q = output.p;                           // ax(1-n)/(b+c)
    }}

    /**
     * @dev returns:
     * `p = ax(1-n)/e`
     * `q = ax(1-n)/e`
     * `r = bx(1-n)/e`
     * `s = x(1-n)(b+c)/e`
     * `t = ax(1-n)(e-b-c)/be`
     */
    function deficit(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) { unchecked {
        validate(a, b, c, e, n, x, true);
        uint256 y = e * M;
        uint256 z = x * (M - n);
        output.p = MathEx.mulDivF(a, z, y).toInt256();           // ax(1-n)/e
        output.r = MathEx.mulDivF(b, z, y);                      // bx(1-n)/e
        output.s = MathEx.mulDivF(b + c, z, y);                  // x(1-n)(b+c)/e
        output.t = MathEx.mulDivF(a * (e - b - c), z, b.mul(y)); // ax(1-n)(e-b-c)/be
        output.q = output.p;                                     // ax(1-n)/e
    }}

    /**
     * @dev validates the input values
     */
    function validate(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x,
        bool isDeficit
    ) private pure {
        assert(a <= type(uint128).max);
        assert(b <= type(uint128).max);
        assert(c <= type(uint128).max);
        assert(e <= type(uint128).max);
        assert(n <= M);
        assert(x <= e);
        assert((b + c < e) == isDeficit);
    }
}

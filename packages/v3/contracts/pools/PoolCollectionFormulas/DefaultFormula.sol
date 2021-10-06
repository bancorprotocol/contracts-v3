// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { SafeMath, MathEx, Output, isDeficit, M } from "./Common.sol";

/**
 * @dev this library provides mathematical support for base token withdrawal
 */
library DefaultFormula {
    using SafeMath for uint256;

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
        output.p = int256(MathEx.mulDivF(a, z, y));
        output.q = output.p;
        output.r = MathEx.mulDivF(b, z, y);
        output.s = z / M;
        output.t = 0;
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
        output.p = int256(MathEx.mulDivF(a, z, y));
        output.q = output.p;
        output.r = MathEx.mulDivF(b, z, y);
        output.s = MathEx.mulDivF(b + c, z, y);
        output.t = MathEx.mulDivF(a * (e - b - c), z, b.mul(y));
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
        bool state
    ) private pure {
        assert(a <= type(uint128).max);
        assert(b <= type(uint128).max);
        assert(c <= type(uint128).max);
        assert(e <= type(uint128).max);
        assert(n <= M);
        assert(x <= e);
        assert(isDeficit(b, c, e) == state);
    }
}

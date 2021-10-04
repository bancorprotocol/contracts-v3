// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { SafeMath, SafeCast, MathEx, Output, MAX_UINT128, M } from "./Common.sol";

/**
 * @dev this library provides mathematical support for base token withdrawal
 */
library DefaultFormula {
    using SafeMath for uint256;
    using SafeCast for uint256;

    function surplus(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) {
        validate(a, b, c, e, n, x, false);
        uint256 y = (b + c) * M;
        uint256 z = x * (M - n);
        output.p = MathEx.mulDivF(a, z, y).toInt256(); // ax(1-n)/(b+c)
        output.r = MathEx.mulDivF(b, z, y);            // bx(1-n)/(b+c)
        output.s = z / M;                              // x(1-n)
        output.t = 0;                                  // 0
        output.q = output.p;                           // ax(1-n)/(b+c)
    }

    function deficit(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) {
        validate(a, b, c, e, n, x, true);
        uint256 y = e * M;
        uint256 z = x * (M - n);
        output.p = MathEx.mulDivF(a, z, y).toInt256();            // ax(1-n)/e
        output.r = MathEx.mulDivF(b, z, y);                       // bx(1-n)/e
        output.s = MathEx.mulDivF(b + c, z, y);                   // x(1-n)(b+c)/e
        output.t = MathEx.mulDivF(e - b - c, a.mul(z), b.mul(y)); // ax(1-n)(e-b-c)/be
        output.q = output.p;                                      // ax(1-n)/e
    }

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
        assert(a <= MAX_UINT128);
        assert(b <= MAX_UINT128);
        assert(c <= MAX_UINT128);
        assert(e <= MAX_UINT128);
        assert(n <= M);
        assert(x <= e);
        assert((b + c < e) == isDeficit);
    }
}

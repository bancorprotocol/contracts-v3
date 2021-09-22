// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { SafeMath, MathEx, Output, MAX_UINT128, M } from "./Common.sol";

/**
 * @dev this library provides mathematical support for TKN withdrawal
 */
library DefaultFormula {
    using SafeMath for uint256;

    function surplus(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) {
        validate(a, b, c, e, n, x);
        assert(b + c >= e);
        uint256 y = (b + c) * M;
        uint256 z = x * (M - n);
        output.p = MathEx.mulDivF(a, z, y);
        output.r = MathEx.mulDivF(b, z, y);
        output.s = z / M;
        output.t = 0;
        output.q = output.p;
    }

    function deficit(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) {
        validate(a, b, c, e, n, x);
        assert(b + c < e);
        uint256 y = e * M;
        uint256 z = x * (M - n);
        output.p = MathEx.mulDivF(a, z, y);
        output.r = MathEx.mulDivF(b, z, y);
        output.s = MathEx.mulDivF(z, b + c, y);
        output.t = MathEx.mulDivF(a.mul(z), e - b - c, b.mul(y));
        output.q = output.p;
    }

    function validate(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) private pure {
        assert(a <= MAX_UINT128);
        assert(b <= MAX_UINT128);
        assert(c <= MAX_UINT128);
        assert(e <= MAX_UINT128);
        assert(x <= MAX_UINT128);
        assert(n <= M);
    }
}

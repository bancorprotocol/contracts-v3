// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { SafeMath, MathEx, Output, MAX_UINT128, M } from "./Common.sol";

/**
 * @dev this library provides mathematical support for TKN withdrawal
 */
library ArbitrageFormula {
    using SafeMath for uint256;

    struct Data {
        uint256 f; // BNT tentative pool balance
        uint256 g; // TKN new pool balance
        uint256 h; // TKN amount to buy or sell 
        uint256 k; // BNT amount to mint or burn
    }

    function surplus(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory) {
        validate(a, b, c, e, m, n, x, false);
        uint256 y = (b + c) * M;
        uint256 z = x * (M - n);
        return surplus(surplus(a, b, c, e, m, n, x, y, z), a, b, y, z);
    }

    function deficit(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) {
        validate(a, b, c, e, m, n, x, true);
        uint256 y = (b + c) * M;
        uint256 z = x * (M - n);
        return deficit(deficit(a, b, c, e, m, n, x, y, z), a, b, y, z);
    }

    function surplus(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (Data memory data) {
        data.f = MathEx.mulDivF(a, y.sub(z), y);
        data.g = MathEx.mulDivF(b, y.sub(z), y);
        data.h = MathEx.mulDivF(x, (b + c - e) * M + e * n, e * M);
        data.k = MathEx.mulDivF(data.f.mul(data.h), data.g * (2 * M - m) - data.h * M, data.g.mul(data.g * (M - m)));
        assert(x.mul(a * n).add(data.k.mul(b * M)) > data.h.mul(a * 2 * M));
    }

    function deficit(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (Data memory data) {
        data.f = MathEx.mulDivF(a, y.sub(z), y);
        data.g = MathEx.mulDivF(b, y.sub(z), y);
        data.h = MathEx.mulDivF(x, (e - b - c) * M - e * n, e * M);
        data.k = MathEx.mulDivF(data.f.mul(data.h), data.g * (2 * M - m) + data.h * M, data.g.mul(data.g * M + data.h * m));
        assert(x.mul(a * n).add(data.h.mul((a + 1) * M)) > data.k.mul(b * M));
    }

    function surplus(
        Data memory data,
        uint256 a,
        uint256 b,
        uint256 y,
        uint256 z
    ) private pure returns (Output memory output) {
        output.p = surplus(a, y, z, data.k);
        output.q = surplus(a, y, z, MathEx.mulDivF(data.f, data.h, data.g));
        output.r = MathEx.mulDivF(b, z, y);
        output.s = z / M;
    }

    function deficit(
        Data memory data,
        uint256 a,
        uint256 b,
        uint256 y,
        uint256 z
    ) private pure returns (Output memory output) {
        output.p = deficit(a, y, z, data.k);
        output.q = deficit(a, y, z, MathEx.mulDivF(data.f, data.h, data.g));
        output.r = MathEx.mulDivF(b, z, y);
        output.s = z / M;
    }

    function surplus(
        uint256 a,
        uint256 y,
        uint256 z,
        uint256 w
    ) private pure returns (uint256) {
        return a.mul(z).add(w.mul(y)).div(y);
    }

    function deficit(
        uint256 a,
        uint256 y,
        uint256 z,
        uint256 w
    ) private pure returns (uint256) {
        return a.mul(z).sub(w.mul(y)).div(y);
    }

    function validate(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x,
        bool isDeficit
    ) private pure {
        assert(a <= MAX_UINT128);
        assert(b <= MAX_UINT128);
        assert(c <= MAX_UINT128);
        assert(e <= MAX_UINT128);
        assert(x <= MAX_UINT128);
        assert(m <= M);
        assert(n <= M);
        assert((b + c < e) == isDeficit);
    }
}

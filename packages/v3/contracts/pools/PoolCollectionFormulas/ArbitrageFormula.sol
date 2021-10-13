// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { SafeCast, SafeMath, SignedSafeMath, MathEx, Output, isDeficit, M } from "./Common.sol";

/**
 * @dev this library provides mathematical support for base token withdrawal
 */
library ArbitrageFormula {
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    struct Data {
        uint256 f;
        uint256 g;
        uint256 h;
        uint256 k;
    }

    /**
     * @dev returns:
     * `p = ax(1-n)/(b+c)+k`
     * `q = ax(1-n)/(b+c)+hf/g`
     * `r = bx(1-n)/(b+c)`
     * `s = x(1-n)`
     * after computing:
     * `f = a(b+c-x(1-n))/(b+c)`
     * `g = b(b+c-x(1-n))/(b+c)`
     * `h = x(b+c-e(1-n))/e`
     * `k = fh(g(2-m)-h)/(gg-ggm)`
     * and asserting that `axn+bk > 2ah`
     */
    function surplus(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory) { unchecked {
        validate(a, b, c, e, m, n, x, false);
        uint256 y = (b + c) * M;
        uint256 z = x * (M - n);
        return surplus(surplus(a, b, e, m, n, x, y, z), a, b, y, z);
    }}

    /**
     * @dev returns:
     * `p = ax(1-n)/(b+c)-k`
     * `q = ax(1-n)/(b+c)-hf/g`
     * `r = bx(1-n)/(b+c)`
     * `s = x(1-n)`
     * after computing:
     * `f = a(b+c-x(1-n))/(b+c)`
     * `g = b(b+c-x(1-n))/(b+c)`
     * `h = x(e(1-n)-b-c)/e`
     * `k = fh(g(2-m)+h)/(gg+ghm)`
     * and asserting that `axn+2ah > bk`
     */
    function deficit(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) { unchecked {
        validate(a, b, c, e, m, n, x, true);
        uint256 y = (b + c) * M;
        uint256 z = x * (M - n);
        return deficit(deficit(a, b, e, m, n, x, y, z), a, b, y, z);
    }}

    /**
     * @dev returns:
     * `f = a(b+c-x(1-n))/(b+c)`
     * `g = b(b+c-x(1-n))/(b+c)`
     * `h = x(b+c-e(1-n))/e`
     * `k = fh(g(2-m)-h)/(gg-ggm)`
     * after asserting that `axn+bk > 2ah`
     */
    function surplus(
        uint256 a,
        uint256 b,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (Data memory data) { unchecked {
        data.f = MathEx.mulDivF(a, y - z, y);
        data.g = MathEx.mulDivF(b, y - z, y);
        data.h = MathEx.mulDivF(x, y - e * (M - n), e * M);
        data.k = MathEx.mulDivF(data.f.mul(data.h), (data.g * (2 * M - m)).sub(data.h * M), data.g.mul(data.g * (M - m)));
        assert(x.mul(a * n).add(data.k.mul(b * M)) > data.h.mul(a * 2 * M));
    }}

    /**
     * @dev returns:
     * `f = a(b+c-x(1-n))/(b+c)`
     * `g = b(b+c-x(1-n))/(b+c)`
     * `h = x(e(1-n)-b-c)/e`
     * `k = fh(g(2-m)+h)/(gg+ghm)`
     * after asserting that `axn+2ah > bk`
     */
    function deficit(
        uint256 a,
        uint256 b,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (Data memory data) { unchecked {
        data.f = MathEx.mulDivF(a, y.sub(z), y);
        data.g = MathEx.mulDivF(b, y.sub(z), y);
        data.h = e * (M - n) > y ? MathEx.mulDivF(x, e * (M - n) - y, e * M) : 0;
        data.k = MathEx.mulDivF(data.f * data.h, data.g * (2 * M - m) + data.h * M, data.g.mul(data.g * M + data.h * m));
        assert(x.mul(a * n).add(data.h.mul(a * 2 * M)) > data.k.mul(b * M));
    }}

    /**
     * @dev returns:
     * `p = ax(1-n)/(b+c)+k`
     * `q = ax(1-n)/(b+c)+hf/g`
     * `r = bx(1-n)/(b+c)`
     * `s = x(1-n)`
     */
    function surplus(
        Data memory data,
        uint256 a,
        uint256 b,
        uint256 y,
        uint256 z
    ) private pure returns (Output memory output) { unchecked {
        output.p = surplus(a, y, z, data.k);
        output.q = surplus(a, y, z, MathEx.mulDivF(data.h, data.f, data.g));
        output.r = MathEx.mulDivF(b, z, y);
        output.s = z / M;
    }}

    /**
     * @dev returns:
     * `p = ax(1-n)/(b+c)-k`
     * `q = ax(1-n)/(b+c)-hf/g`
     * `r = bx(1-n)/(b+c)`
     * `s = x(1-n)`
     */
    function deficit(
        Data memory data,
        uint256 a,
        uint256 b,
        uint256 y,
        uint256 z
    ) private pure returns (Output memory output) { unchecked {
        output.p = deficit(a, y, z, data.k);
        output.q = deficit(a, y, z, MathEx.mulDivF(data.h, data.f, data.g));
        output.r = MathEx.mulDivF(b, z, y);
        output.s = z / M;
    }}

    /**
     * @dev returns `az/y+w`
     */
    function surplus(
        uint256 a,
        uint256 y,
        uint256 z,
        uint256 w
    ) private pure returns (int256) { unchecked {
        uint256 u = a.mul(z);
        uint256 v = w.mul(y);
        return (u.add(v) / y).toInt256();
    }}

    /**
     * @dev returns `az/y-w`
     */
    function deficit(
        uint256 a,
        uint256 y,
        uint256 z,
        uint256 w
    ) private pure returns (int256) { unchecked {
        uint256 u = a.mul(z);
        uint256 v = w.mul(y);
        return u > v ? ((u - v) / y).toInt256() : -((v - u) / y).toInt256();
    }}

    /**
     * @dev validates the input values
     */
    function validate(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x,
        bool state
    ) private pure {
        assert(a <= type(uint128).max);
        assert(b <= type(uint128).max);
        assert(c <= type(uint128).max);
        assert(e <= type(uint128).max);
        assert(m <= M);
        assert(n <= M);
        assert(x <= e);
        assert(isDeficit(b, c, e) == state);
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { SafeMath, isDeficit, M } from "./Common.sol";

/**
 * @dev this library provides mathematical support for base token withdrawal
 */
library ThresholdFormula {
    using SafeMath for uint256;

    struct Uint512 {
        uint256 hi;
        uint256 lo;
    }

    /**
     * @dev returns true if and only if `hMax(b, c, e, m, n) > x` when in surplus
     */
    function surplus(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (bool) { unchecked {
        validate(b, c, e, m, n, x, false);
        Uint512 memory hMaxD;
        Uint512 memory hMaxN = mul512(mul256(b * e, b + c), e * n * M + (b + c - e) * m * M); // be(b+c)(en+(b+c-e)m)
        hMaxD = add512(hMaxD, mul256(b * b, b * M * M));                 // + bbb
        hMaxD = add512(hMaxD, mul256(b * b, c * M * M * 3));             // + 3bbc
        hMaxD = add512(hMaxD, mul256(b * c, c * M * M * 3));             // + 3bcc
        hMaxD = add512(hMaxD, mul256(b * e, e * (M - n) * (M - m)));     // + bee(1-n)(1-m)
        hMaxD = add512(hMaxD, mul256(c * c, c * M * M));                 // + ccc
        hMaxD = add512(hMaxD, mul256(c * e, e * (M - n) * (M - n)));     // + cee(1-n)(1-n)
        hMaxD = sub512(hMaxD, mul256(b * b, e * (M - n) * (M * 2 - m))); // - bbe(1-n)(2-m)
        hMaxD = sub512(hMaxD, mul256(b * c, e * (M - n) * (M * 4 - m))); // - bce(1-n)(4-m)
        hMaxD = sub512(hMaxD, mul256(c * c, e * (M - n) * M * 2));       // - 2cce(1-n)
        return gt512(hMaxN, mul512(hMaxD, x));
    }}

    /**
     * @dev returns true if and only if `hMax(b, c, e, m, n) > x` when in deficit
     */
    function deficit(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (bool) { unchecked {
        validate(b, c, e, m, n, x, true);
        Uint512 memory hMaxD;
        Uint512 memory hMaxN = mul512(mul256(b * e, b + c), e * n * (M - m) + (e - b - c) * m * M); // be(b+c)(en(1-m)+(e-b-c)m)
        hMaxD = add512(hMaxD, mul256(b * b, b * (M - m * 2) * M));                           // + bbb(1-2m)
        hMaxD = add512(hMaxD, mul256(b * b, c * (M - m * 2) * M * 3));                       // + 3bbc(1-2m)
        hMaxD = add512(hMaxD, mul256(b * c, c * (M - m * 2) * M * 3));                       // + 3bcc(1-2m)
        hMaxD = add512(hMaxD, mul256(b * e, e * (M - n) * (M - m)));                         // + bee(1-n)(1-m)
        hMaxD = add512(hMaxD, mul256(c * c, c * (M - m * 2) * M));                           // + ccc(1-2m)
        hMaxD = add512(hMaxD, mul256(c * e, e * ((M - n) * (M - m) - m * M) * (M - n) / M)); // + cee(1-n)((1-n)(1-m)-m)
        hMaxD = sub512(hMaxD, mul256(b * b, e * ((M - n) * (M - m) * 2 - m * M)));           // - bbe(2(1-n)(1-m)-m)
        hMaxD = sub512(hMaxD, mul256(b * c, e * ((M - n) * (M - m) * 4 - m * (M * 3 - n)))); // - bce(4(1-n)(1-m)-m(3-n))
        hMaxD = sub512(hMaxD, mul256(c * c, e * ((M - n) * (M - m) * 2 - m * (M * 2 - n)))); // - cce(2(1-n)(1-m)-m(2-n))
        return gt512(hMaxN, mul512(hMaxD, x));
    }}

    /**
     * @dev validates the input values
     */
    function validate(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x,
        bool state
    ) private pure {
        assert(b <= type(uint128).max);
        assert(c <= type(uint128).max);
        assert(e <= type(uint128).max);
        assert(m <= M / 2);
        assert(n <= M / 2);
        assert(x <= e);
        assert(isDeficit(b, c, e) == state);
    }

    /**
     * @dev returns the value of `x * y`
     */
    function mul256(uint256 x, uint256 y) private pure returns (Uint512 memory) { unchecked {
        uint256 p = mulmod(x, y, type(uint256).max);
        uint256 q = x * y;
        uint256 r = p < q ? 1 : 0;
        return Uint512({ hi: p - q - r, lo: q });
    }}

    /**
     * @dev returns the value of `x * y`
     */
    function mul512(Uint512 memory x, uint256 y) private pure returns (Uint512 memory) { unchecked {
        Uint512 memory xloy = mul256(x.lo, y);
        return Uint512({ hi: x.hi.mul(y).add(xloy.hi), lo: xloy.lo });
    }}

    /**
     * @dev returns the value of `x + y`
     */
    function add512(Uint512 memory x, Uint512 memory y) private pure returns (Uint512 memory) { unchecked {
        uint256 r = x.lo + y.lo < x.lo ? 1 : 0;
        return Uint512({ hi: x.hi.add(y.hi).add(r), lo: x.lo + y.lo });
    }}

    /**
     * @dev returns the value of `x - y`
     */
    function sub512(Uint512 memory x, Uint512 memory y) private pure returns (Uint512 memory) { unchecked {
        uint256 r = x.lo < y.lo ? 1 : 0;
        return Uint512({ hi: x.hi.sub(y.hi).sub(r), lo: x.lo - y.lo + r });
    }}

    /**
     * @dev returns the value of `x > y`
     */
    function gt512(Uint512 memory x, Uint512 memory y) private pure returns (bool) { unchecked {
        return x.hi > y.hi || (x.hi == y.hi && x.lo > y.lo);
    }}
}

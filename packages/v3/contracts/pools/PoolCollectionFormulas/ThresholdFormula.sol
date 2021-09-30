// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { SafeMath, MAX_UINT128, MAX_UINT256, M } from "./Common.sol";

/**
 * @dev this library provides mathematical support for base token withdrawal
 */
library ThresholdFormula {
    using SafeMath for uint256;

    struct Uint512 {
        uint256 hi;
        uint256 lo;
    }

    function surplus(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (bool) {
        validate(b, c, e, m, n, x, false);
        Uint512 memory hMaxD;
        Uint512 memory hMaxN = mul512(mul256(b * e, b + c), e * n * M + (b + c - e) * m * M); // be(b+c)(en+(b+c-e)m)
        hMaxD = add512(hMaxD, mul256(b * b, b * M * M));                 // + bbb
        hMaxD = add512(hMaxD, mul256(b * b, c * M * M * 3));             // + 3bbc
        hMaxD = add512(hMaxD, mul256(b * c, c * M * M * 3));             // + 3bcc
        hMaxD = add512(hMaxD, mul256(b * e, e * (M - n) * (M - m)));     // + bee(1-n)(1-m)
        hMaxD = add512(hMaxD, mul256(c * c, c * M * M));                 // + ccc
        hMaxD = add512(hMaxD, mul256(c * e, e * (M - n) * (M - n)));     // + cee(1-n)(1-n)
        hMaxD = sub512(hMaxD, mul256(b * b, e * (M - n) * (2 * M - m))); // - bbe(1-n)(2-m)
        hMaxD = sub512(hMaxD, mul256(b * c, e * (M - n) * (4 * M - m))); // - bce(1-n)(4-m)
        hMaxD = sub512(hMaxD, mul256(c * c, e * (M - n) * 2 * M));       // - 2cce(1-n)
        return gt512(hMaxN, mul512(hMaxD, x));
    }

    function deficit(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (bool) {
        validate(b, c, e, m, n, x, true);
        Uint512 memory hMaxD;
        Uint512 memory hMaxN = mul512(mul256(b * e, b + c), e * n * (M - m) + (e - b - c) * m * M); // be(b+c)(en(1-m)+(e-b-c)m)
        hMaxD = add512(hMaxD, mul256(b * b, b * (M - 2 * m) * M));                           // + bbb(1-2m)
        hMaxD = add512(hMaxD, mul256(b * b, c * (M - 2 * m) * M * 3));                       // + 3bbc(1-2m)
        hMaxD = add512(hMaxD, mul256(b * c, c * (M - 2 * m) * M * 3));                       // + 3bcc(1-2m)
        hMaxD = add512(hMaxD, mul256(b * e, e * (M - n) * (M - m)));                         // + bee(1-n)(1-m)
        hMaxD = add512(hMaxD, mul256(c * c, c * (M - 2 * m) * M));                           // + ccc(1-2m)
        hMaxD = add512(hMaxD, mul256(c * e, e * (M - n) * ((M - n) * (M - m) - m * M) / M)); // + cee(1-n)((1-n)(1-m)-m)
        hMaxD = sub512(hMaxD, mul256(b * b, e * (2 * (M - n) * (M - m) - m * M)));           // - bbe(2(1-n)(1-m)-m)
        hMaxD = sub512(hMaxD, mul256(b * c, e * (4 * (M - n) * (M - m) - m * (3 * M - n)))); // - bce(4(1-n)(1-m)-m(3-n))
        hMaxD = sub512(hMaxD, mul256(c * c, e * (2 * (M - n) * (M - m) - m * (2 * M - n)))); // - cce(2(1-n)(1-m)-m(2-n))
        return gt512(hMaxN, mul512(hMaxD, x));
    }

    function validate(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x,
        bool isDeficit
    ) private pure {
        assert(b <= MAX_UINT128);
        assert(c <= MAX_UINT128);
        assert(e <= MAX_UINT128);
        assert(x <= MAX_UINT128);
        assert(m <= M / 2);
        assert(n <= M / 2);
        assert((b + c < e) == isDeficit);
    }

    /**
     * @dev returns the value of `x * y`
     */
    function mul256(uint256 x, uint256 y) private pure returns (Uint512 memory) {
        uint256 p = mulmod(x, y, MAX_UINT256);
        uint256 q = x * y;
        uint256 r = p < q ? 1 : 0;
        return Uint512({ hi: p - q - r, lo: q });
    }

    /**
     * @dev returns the value of `x * y`
     */
    function mul512(Uint512 memory x, uint256 y) private pure returns (Uint512 memory) {
        Uint512 memory xloy = mul256(x.lo, y);
        return Uint512({ hi: x.hi.mul(y).add(xloy.hi), lo: xloy.lo });
    }

    /**
     * @dev returns the value of `x + y`
     */
    function add512(Uint512 memory x, Uint512 memory y) private pure returns (Uint512 memory) {
        uint256 r = x.lo + y.lo < x.lo ? 1 : 0;
        return Uint512({ hi: x.hi.add(y.hi).add(r), lo: x.lo + y.lo });
    }

    /**
     * @dev returns the value of `x - y`
     */
    function sub512(Uint512 memory x, Uint512 memory y) private pure returns (Uint512 memory) {
        uint256 r = x.lo < y.lo ? 1 : 0;
        return Uint512({ hi: x.hi.sub(y.hi).sub(r), lo: x.lo - y.lo + r });
    }

    /**
     * @dev returns the value of `x > y`
     */
    function gt512(Uint512 memory x, Uint512 memory y) private pure returns (bool) {
        return x.hi > y.hi || (x.hi == y.hi && x.lo > y.lo);
    }
}

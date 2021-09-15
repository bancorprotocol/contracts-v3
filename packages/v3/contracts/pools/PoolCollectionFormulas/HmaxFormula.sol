// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import { MAX_UINT128, MAX_UINT256, PPM_RESOLUTION } from "../../utility/Constants.sol";

/**
 * @dev this library provides mathematical support for TKN withdrawal
 */
library HmaxFormula {
    using SafeMath for uint256;

    uint256 private constant M = PPM_RESOLUTION;

    struct uint512 {
        uint256 hi;
        uint256 lo;
    }

    function surplus(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    )
        internal
        pure
        returns (bool)
    {
        assert(b <= MAX_UINT128);
        assert(c <= MAX_UINT128);
        assert(d <= MAX_UINT128);
        assert(e <= MAX_UINT128);
        assert(x <= MAX_UINT128);
        assert(m <= M / 2);
        assert(n <= M / 2);
        assert(b + c >= e);

        uint512 memory hMaxD;
        uint512 memory hMaxN = _mul256(b * d, ((b + c) * M).mul(e * n + (b + c - e) * m)); // bd(b+c)(en+(b+c-e)m)
        hMaxD = _add512(hMaxD, _mul256(b * b, b * M * M));                                 // + bbb
        hMaxD = _add512(hMaxD, _mul256(b * b, c * M * M * 3));                             // + 3bbc
        hMaxD = _add512(hMaxD, _mul256(b * c, c * M * M * 3));                             // + 3bcc
        hMaxD = _add512(hMaxD, _mul256(b * e, e * (M - n) * (M - m)));                     // + bee(1-n)(1-m)
        hMaxD = _add512(hMaxD, _mul256(c * c, c * M * M));                                 // + ccc
        hMaxD = _add512(hMaxD, _mul256(c * e, e * (M - n) * (M - n)));                     // + cee(1-n)(1-n)
        hMaxD = _sub512(hMaxD, _mul256(b * b, e * (M - n) * (2 * M - m)));                 // - bbe(1-n)*(2-m)
        hMaxD = _sub512(hMaxD, _mul256(b * c, e * (M - n) * (4 * M - m)));                 // - bce(1-n)*(4-m)
        hMaxD = _sub512(hMaxD, _mul256(c * c, e * (M - n) * 2 * M));                       // - 2cce(1-n)
        return _gt512(hMaxN, _mul512(hMaxD, x));
    }

    function deficit(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    )
        internal
        pure
        returns (bool)
    {
        assert(b <= MAX_UINT128);
        assert(c <= MAX_UINT128);
        assert(d <= MAX_UINT128);
        assert(e <= MAX_UINT128);
        assert(x <= MAX_UINT128);
        assert(m <= M / 2);
        assert(n <= M / 2);
        assert(b + c <= e);

        uint512 memory hMaxD;
        uint512 memory hMaxN = _mul256(b * d, (b + c).mul(e * (n * M + (M - n) * m) - (b + c) * m * M)); // bd(b+c)(e(n+(1-n)m)-(b+c)m)
        hMaxD = _add512(hMaxD, _mul256(b * b, b * (M - 2 * m) * M));                                     // + bbb(1-2m)
        hMaxD = _add512(hMaxD, _mul256(b * b, c * (M - 2 * m) * M * 3));                                 // + 3bbc(1-2m)
        hMaxD = _add512(hMaxD, _mul256(b * c, c * (M - 2 * m) * M * 3));                                 // + 3bcc(1-2m)
        hMaxD = _add512(hMaxD, _mul256(b * e, e * (M - n) * (M - m)));                                   // + bee(1-n)(1-m)
        hMaxD = _add512(hMaxD, _mul256(c * c, c * (M - 2 * m) * M));                                     // + ccc(1-2m)
        hMaxD = _add512(hMaxD, _mul256(c * e, e * (M - n) * ((M - n) * (M - m) / M - m)));               // + cee(1-n)((1-n)(1-m)-m)
        hMaxD = _sub512(hMaxD, _mul256(b * b, e * (2 * (M - n) * (M - m) - m * M)));                     // - bbe(2(1-n)(1-m)-m)
        hMaxD = _sub512(hMaxD, _mul256(b * c, e * (4 * (M - n) * (M - m) - m * (3 * M - n))));           // - bce(4(1-n)(1-m)-m(3-n))
        hMaxD = _sub512(hMaxD, _mul256(c * c, e * (2 * (M - n) * (M - m) - m * (2 * M - n))));           // - cce(2(1-n)(1-m)-m(2-n))
        return _gt512(hMaxN, _mul512(hMaxD, x));
    }

    /**
     * @dev returns the value of `x * y`
     */
    function _mul256(uint256 x, uint256 y) private pure returns (uint512 memory) {
        uint256 p = mulmod(x, y, MAX_UINT256);
        uint256 q = x * y;
        uint256 r = p < q ? 1 : 0;
        return uint512({ hi: p - q - r, lo: q });
    }

    /**
     * @dev returns the value of `x + y`
     */
    function _add512(uint512 memory x, uint512 memory y) private pure returns (uint512 memory) {
        uint256 r = x.lo + y.lo < x.lo ? 1 : 0;
        return uint512({ hi: x.hi.add(y.hi).add(r), lo: x.lo + y.lo });
    }

    /**
     * @dev returns the value of `x - y`
     */
    function _sub512(uint512 memory x, uint512 memory y) private pure returns (uint512 memory) {
        uint256 r = x.lo < y.lo ? 1 : 0;
        return uint512({ hi: x.hi.sub(y.hi).sub(r), lo: x.lo - y.lo + r });
    }

    /**
     * @dev returns the value of `x * y`
     */
    function _mul512(uint512 memory x, uint256 y) private pure returns (uint512 memory) {
        uint512 memory xloy = _mul256(x.lo, y);
        return uint512({ hi: x.hi.mul(y).add(xloy.hi), lo: xloy.lo });
    }

    /**
     * @dev returns the value of `x > y`
     */
    function _gt512(uint512 memory x, uint512 memory y) private pure returns (bool) {
        return x.hi > y.hi || (x.hi == y.hi && x.lo > y.lo);
    }
}

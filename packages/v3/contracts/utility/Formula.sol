// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./MathEx.sol";

/**
 * @dev this library provides a set of functions supporting BNTKN withdrawal
 */
library Formula {
    using SafeMath for uint256;
    using MathEx for *;

    struct hMax {
        uint256 p;
        uint256 q;
        uint256 r;
        uint256 s;
    }

    /**
     * @dev returns true if and only if `c(c - e)^2 / b <= 2^256 - 1`
     *
     * b = TKN pool balance
     * c = TKN excess amount
     * e = TKN staked amount
     */
    function hMaxComputable(
        uint256 b,
        uint256 c,
        uint256 e
    ) internal pure returns (bool) {
        uint256 f = c > e ? c - e : e - c;
        (uint256 hi1, uint256 lo1) = MathEx.mul512(b, MAX_UINT256);
        (uint256 hi2, uint256 lo2) = MathEx.mul512(c, f.mul(f));
        return gte512(hi1, lo1, hi2, lo2);
    }

    /**
     * @dev returns `bden(b + c) / {b^3 + b^2(3c - 2e) + b[e^2(n + 1) + c(3c - 4e)] + c(c - e)^2} >= x`
     *
     * b = TKN pool balance
     * c = TKN excess amount
     * d = BNTKN total supply
     * e = TKN staked amount
     * n = withdrawal fee in ppm units
     * x = BNTKN withdrawal amount
     */
    function hMaxCondition(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 n,
        uint256 x
    ) internal pure returns (bool) {
        hMax memory parts = hMaxParts(b, c, d, e, n);
        (uint256 hi1, uint256 lo1) = MathEx.mul512(parts.p, parts.q);
        (uint256 hi2, uint256 lo2) = mul512twice(parts.r, parts.s, x);
        return gte512(hi1, lo1, hi2, lo2);
    }

    /**
     * @dev returns a tuple {p, q, r, s} such that:
     * `pq / rs = bden(b + c) / {b^3 + b^2(3c - 2e) + b[e^2(n + 1) + c(3c - 4e)] + c(c - e)^2}`
     *
     * b = TKN pool balance
     * c = TKN excess amount
     * d = BNTKN total supply
     * e = TKN staked amount
     * n = withdrawal fee in ppm units
     */
    function hMaxParts(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 n
    ) internal pure returns (hMax memory) {
        return hMax({ p: d.mul(e), q: b.add(c).mul(n), r: hMaxR(b, c, e, n), s: PPM_RESOLUTION });
    }

    /**
     * @dev returns `b^2 + b(3c - 2e) + e^2(n + 1) + c(3c - 4e) + c(c - e)^2 / b`
     *
     * b = TKN pool balance
     * c = TKN excess amount
     * e = TKN staked amount
     * n = withdrawal fee in ppm units
     */
    function hMaxR(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n
    ) internal pure returns (uint256) {
        uint256 f = c > e ? c - e : e - c;
        uint256 r = b.mul(b);
        r = r.add(b.mul(c).mul(3));
        r = r.add(c.mul(c).mul(3));
        r = r.add(MathEx.mulDivC(e.mul(e), n + PPM_RESOLUTION, PPM_RESOLUTION));
        r = r.add(MathEx.mulDivC(c, f.mul(f), b));
        r = r.sub(b.mul(e).mul(2));
        r = r.sub(c.mul(e).mul(4));
        return r;
    }

    /**
     * @dev returns the value of `x * y * z` as a pair of 256-bit values
     */
    function mul512twice(
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (uint256, uint256) {
        (uint256 xyh, uint256 xyl) = MathEx.mul512(x, y);
        (uint256 xylzh, uint256 xylzl) = MathEx.mul512(xyl, z);
        return (xyh.mul(z).add(xylzh), xylzl);
    }

    /**
     * @dev returns true if and only if `2^256 * hi1 + lo1 >= 2^256 * hi2 + lo2`
     */
    function gte512(
        uint256 hi1,
        uint256 lo1,
        uint256 hi2,
        uint256 lo2
    ) private pure returns (bool) {
        return hi1 > hi2 || (hi1 == hi2 && lo1 >= lo2);
    }
}

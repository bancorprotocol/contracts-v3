// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./MathEx.sol";
import "./Utils.sol";

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
     * @dev returns `b^2 + b(3c - 2e) + e^2(n + 1) + c(3c - 4e) + c(c - e)^2 / b`
     *
     * b = TKN pool balance
     * c = TKN excess amount
     * e = TKN staked amount
     * n = withdrawal fee in ppm units
     */
    function hMaxR(uint256 b, uint256 c, uint256 e, uint256 n) internal pure returns (uint256) {
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
     * @dev returns a tuple {p, q, r, s} such that:
     * `pq / rs = bden(b + c) / {b^3 + b^2(3c - 2e) + b[e^2(n + 1) + c(3c - 4e)] + c(c - e)^2}`
     *
     * b = TKN pool balance
     * c = TKN excess amount
     * d = BNTKN total supply
     * e = TKN staked amount
     * n = withdrawal fee in ppm units
     */
    function hMaxParts(uint256 b, uint256 c, uint256 d, uint256 e, uint256 n) internal pure returns (hMax memory) {
        return hMax({
            p: d.mul(e),
            q: b.add(c).mul(n),
            r: hMaxR(b, c, e, n),
            s: PPM_RESOLUTION
        });
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
    function hMaxLargerThanOrEqualTo(uint256 b, uint256 c, uint256 d, uint256 e, uint256 n, uint256 x) internal pure returns (bool) {
        hMax memory parts = hMaxParts(b, c, d, e, n);

        (uint256 hiN, uint256 loN) = MathEx.mul512(parts.p, parts.q);
        (uint256 hiD, uint256 loD) = MathEx.mul512(parts.r, parts.s.mul(x)); // TODO: mul the smallest two values

        return (hiN > hiD || (hiN == hiD && loN >= loD));
    }
}

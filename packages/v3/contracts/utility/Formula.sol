// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./MathEx.sol";

/**
 * @dev this library provides mathematical support for TKN withdrawal
 */
library Formula {
    using SafeMath for uint256;
    using MathEx for *;

    struct WithdrawalAmounts {
        uint256 B;
        uint256 C;
        uint256 D;
        uint256 E;
        uint256 F;
        uint256 G;
    }

    struct MaxArb {
        uint256 p;
        uint256 q;
        uint256 r;
        uint256 s;
    }

    /**
     * @dev returns the TKN withdrawal amounts, where each amount includes
     * the withdrawl fee, which may need to be deducted (depending on usage)
     *
     * input:
     * a = BNT pool balance
     * b = TKN pool balance
     * c = TKN excess amount
     * d = BNTKN total supply
     * e = TKN staked amount
     * m = trade fee in ppm units
     * n = withdrawal fee in ppm units
     * x = BNTKN withdrawal amount
     *
     * output:
     * B = TKN amount to transfer to the user
     * C = BNT amount to transfer to the user
     * D = TKN amount to remove from the pool
     * E = TKN amount to remove from the vault
     * F = BNT amount to remove from the pool
     * G = BNT amount to add to the pool
     */
    function withdrawalAmounts(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (WithdrawalAmounts memory) {
        WithdrawalAmounts memory amounts;
        uint256 bPc = b.add(c);
        if (bPc >= e) {
            // TKN is in surplus
            uint256 eMx = e.mul(x);
            uint256 dMbPc = d.mul(bPc);
            amounts.B = eMx / d;
            amounts.D = MathEx.mulDivF(b, eMx, dMbPc);
            amounts.E = MathEx.mulDivF(c, eMx, dMbPc);
            amounts.F = MathEx.mulDivF(a, eMx, dMbPc);
            if (maxArbComputable(b, c, e) && maxArbCondition(b, c, d, e, n, x)) {
                // the cost of the arbitrage method is less than the withdrawal fee
                uint256 f = MathEx.mulDivF(bPc - e, x.mul(PPM_RESOLUTION - n), d.mul(n));
                amounts.G = optArb(a - amounts.F, b - amounts.D, f, m);
            }
        } else {
            // TKN is in deficit
            uint256 y = a.mul(e - bPc);
            uint256 bMd = b.mul(d);
            amounts.B = MathEx.mulDivF(bPc, x, d);
            amounts.C = MathEx.mulDivF(y, x, bMd);
            amounts.D = MathEx.mulDivF(b, x, d);
            amounts.E = MathEx.mulDivF(c, x, d);
            amounts.F = MathEx.mulDivF(a, x, d);
        }
        return amounts;
    }

    /**
     * @dev returns true if and only if
     * the cost of the arbitrage method can be computed without overflow
     *
     * input:
     * b = TKN pool balance
     * c = TKN excess amount
     * e = TKN staked amount
     *
     * output:
     * c(c - e)^2 / b <= 2^256 - 1
     */
    function maxArbComputable(
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
     * @dev returns true if and only if
     * the cost of the arbitrage method is less than the withdrawal fee
     *
     * input:
     * b = TKN pool balance
     * c = TKN excess amount
     * d = BNTKN total supply
     * e = TKN staked amount
     * n = withdrawal fee in ppm units
     * x = BNTKN withdrawal amount
     *
     * output (pretending `n` is normalized):
     * bden(b + c) / (b^3 + b^2(3c - 2e) + b(e^2(n + 1) + c(3c - 4e)) + c(c - e)^2) >= x
     */
    function maxArbCondition(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 n,
        uint256 x
    ) internal pure returns (bool) {
        MaxArb memory parts = maxArbParts(b, c, d, e, n);
        (uint256 hi1, uint256 lo1) = MathEx.mul512(parts.p, parts.q);
        (uint256 hi2, uint256 lo2) = mul512twice(parts.r, parts.s, x);
        return gte512(hi1, lo1, hi2, lo2);
    }

    /**
     * @dev returns the cost of the arbitrage method
     *
     * input:
     * b = TKN pool balance
     * c = TKN excess amount
     * d = BNTKN total supply
     * e = TKN staked amount
     * n = withdrawal fee in ppm units
     *
     * output (pretending `n` is normalized) - a tuple `{p, q, r, s}`, such that:
     * pq / rs = bden(b + c) / (b^3 + b^2(3c - 2e) + b(e^2(n + 1) + c(3c - 4e)) + c(c - e)^2)
     */
    function maxArbParts(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 n
    ) internal pure returns (MaxArb memory) {
        return MaxArb({ p: d.mul(e), q: b.add(c).mul(n), r: maxArbR(b, c, e, n), s: PPM_RESOLUTION });
    }

    /**
     * @dev returns the value of `r` in `pq / rs` (the cost of the arbitrage method)
     *
     * input:
     * b = TKN pool balance
     * c = TKN excess amount
     * e = TKN staked amount
     * n = withdrawal fee in ppm units
     *
     * output (pretending `n` is normalized):
     * b^2 + b(3c - 2e) + e^2(n + 1) + c(3c - 4e) + c(c - e)^2 / b
     */
    function maxArbR(
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
     * @dev returns the amount of BNT which should be added to
     * the pool in order to create an optimal arbitrage incentive
     *
     * input:
     * a = BNT pool balance
     * b = TKN pool balance
     * f = TKN target amount
     * m = trade fee in ppm units
     *
     * output (pretending `m` is normalized):
     * af(b(2 - m) + f) / (b(b + mf))
     */
    function optArb(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) internal pure returns (uint256) {
        uint256 x = a.mul(f);
        uint256 y = b.mul(2 * PPM_RESOLUTION - m).add(f.mul(PPM_RESOLUTION));
        uint256 z = b.mul(b.mul(PPM_RESOLUTION).add(f.mul(m)));
        return MathEx.mulDivF(x, y, z);
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

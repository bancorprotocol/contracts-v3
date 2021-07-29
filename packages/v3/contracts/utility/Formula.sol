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

    // solhint-disable var-name-mixedcase

    // BNT actions upon TKN withdrawal
    enum Action {
        none,
        burn,
        mint
    }

    // TKN withdrawal output amounts
    struct WithdrawalAmounts {
        uint256 B; // TKN amount to transfer to the user
        uint256 C; // BNT amount to transfer to the user
        uint256 D; // TKN amount to remove from the pool
        uint256 E; // TKN amount to remove from the vault
        uint256 F; // BNT amount to remove from the pool
        uint256 G; // BNT amount to burn or mint in the pool
        Action H; // BNT action - burn or mint or neither
    }

    // BNTKN maximum arbitrage (given by `pq / rs`)
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
     * G = BNT amount to burn or mint in the pool
     * H = BNT action - burn or mint or neither
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
        uint256 eMx = e.mul(x);
        uint256 bPcMd = bPc.mul(d);
        if (bPc >= e) {
            // TKN is not in deficit
            amounts.B = eMx / d; // [x <= d] --> [B <= e]
            amounts.D = MathEx.mulDivF(b, eMx, bPcMd); // [e <= b+c] and [x <= d] --> [e*x <= (b+c)*d] --> [D <= b]
            amounts.E = MathEx.mulDivF(c, eMx, bPcMd); // [e <= b+c] and [x <= d] --> [e*x <= (b+c)*d] --> [E <= c]
            amounts.F = MathEx.mulDivF(a, eMx, bPcMd); // [e <= b+c] and [x <= d] --> [e*x <= (b+c)*d] --> [F <= a]
            if (maxArbComputable(b, c, e) && maxArbCondition(b, c, d, e, n, x)) {
                // the cost of the arbitrage method is not larger than the withdrawal fee
                uint256 f = MathEx.mulDivF(bPc - e, x.mul(PPM_RESOLUTION - n), d.mul(n));
                amounts.G = optArb(a - amounts.F, b - amounts.D, f, m);
                amounts.H = Action.burn;
            }
        } else if (bPcMd >= eMx) {
            // TKN is in deficit, and the withdrawal is not larger than the total TKN in the vault
            amounts.B = eMx / d; // [x <= d] --> [B <= e]
            amounts.D = MathEx.mulDivF(b, eMx, bPcMd); // [e*x <= (b+c)*d] --> [D <= b]
            amounts.E = MathEx.mulDivF(c, eMx, bPcMd); // [e*x <= (b+c)*d] --> [E <= c]
            amounts.F = MathEx.mulDivF(a, eMx, bPcMd); // [e*x <= (b+c)*d] --> [F <= a]
            if (maxArbComputable(b, c, e) && maxArbCondition(b, c, d, e, n, x)) {
                // the cost of the arbitrage method is not larger than the withdrawal fee
                uint256 f = MathEx.mulDivF(e - bPc, x.mul(PPM_RESOLUTION - n), d.mul(n));
                amounts.G = optArb(a - amounts.F, b - amounts.D, f, m);
                amounts.H = Action.mint;
            }
        } else {
            // TKN is in deficit, and the withdrawal is larger than the total TKN in the vault
            uint256 y = a.mul(e - bPc);
            uint256 bMd = b.mul(d);
            amounts.B = MathEx.mulDivF(bPc, x, d); // [x <= d] --> [B <= b+c < e]
            amounts.C = MathEx.mulDivF(y, x, bMd); // [x <= d] --> [x <= b*d] --> [C <= a*(e-(b+c))]
            amounts.D = MathEx.mulDivF(b, x, d); // [x <= d] --> [D <= b]
            amounts.E = MathEx.mulDivF(c, x, d); // [x <= d] --> [E <= c]
            amounts.F = MathEx.mulDivF(a, x, d); // [x <= d] --> [F <= a]
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
     * a = BNT hypothetical pool balance
     * b = TKN hypothetical pool balance
     * f = TKN arbitrage value
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

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { PPM_RESOLUTION as M } from "../utility/Constants.sol";
import { Sint256, Uint512, MathEx } from "../utility/MathEx.sol";

error PoolCollectionWithdrawalInputInvalid();

/**
 * @dev This library implements the mathematics behind base-token withdrawal.
 * It exposes a single function which takes the following input values:
 * `a` - BNT trading liquidity
 * `b` - base token trading liquidity
 * `c` - base token excess amount
 * `e` - base token staked amount
 * `w` - base token external protection vault balance
 * `m` - trading fee in PPM units
 * `n` - withdrawal fee in PPM units
 * `x` - base token withdrawal amount
 * And returns the following output values:
 * `p` - BNT amount to add to the trading liquidity and to the master vault
 * `q` - BNT amount to add to the protocol equity
 * `r` - base token amount to add to the trading liquidity
 * `s` - base token amount to transfer from the master vault to the provider
 * `t` - BNT amount to mint directly for the provider
 * `u` - base token amount to transfer from the external protection vault to the provider
 * `v` - base token amount to keep in the pool as a withdrawal fee
 * The following table depicts the actual formulae based on the current state of the system:
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * |           |                         Deficit                         |                       Surplus                            |
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * |           | p = a*x*(e*(1-n)-b-c)*(1-m)/(b*e-x*(e*(1-n)-b-c)*(1-m)) | p = -a*x*(b+c-e*(1-n))/(b*e*(1-m)+x*(b+c-e*(1-n))*(1-m)) |
 * |           | q = 0                                                   | q = 0                                                    |
 * |           | r = -x*(e*(1-n)-b-c)/e                                  | r = x*(b+c-e*(1-n))/e                                    |
 * | Arbitrage | s = x*(1-n)                                             | s = x*(1-n)                                              |
 * |           | t = 0                                                   | t = 0                                                    |
 * |           | u = 0                                                   | u = 0                                                    |
 * |           | v = x*n                                                 | v = x*n                                                  |
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * |           | p = -a*z/(b*e) where z = max(x*(1-n)*b-c*(e-x*(1-n)),0) | p = -a*z/b where z = max(x*(1-n)-c,0)                    |
 * |           | q = -a*z/(b*e) where z = max(x*(1-n)*b-c*(e-x*(1-n)),0) | q = -a*z/b where z = max(x*(1-n)-c,0)                    |
 * |           | r = -z/e       where z = max(x*(1-n)*b-c*(e-x*(1-n)),0) | r = -z     where z = max(x*(1-n)-c,0)                    |
 * | Default   | s = x*(1-n)*(b+c)/e                                     | s = x*(1-n)                                              |
 * |           | t = see function `externalProtection`                   | t = 0                                                    |
 * |           | u = see function `externalProtection`                   | u = 0                                                    |
 * |           | v = x*n                                                 | v = x*n                                                  |
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * |           | p = 0                                                   | p = 0                                                    |
 * |           | q = 0                                                   | q = 0                                                    |
 * |           | r = 0                                                   | r = 0                                                    |
 * | Bootstrap | s = x*(1-n)*c/e                                         | s = x*(1-n)                                              |
 * |           | t = see function `externalProtection`                   | t = 0                                                    |
 * |           | u = see function `externalProtection`                   | u = 0                                                    |
 * |           | v = x*n                                                 | v = x*n                                                  |
 * +-----------+---------------------------------------------------------+----------------------------------------------------------+
 * Note that for the sake of illustration, both `m` and `n` are assumed normalized (between 0 and 1).
 * During runtime, it is taken into account that they are given in PPM units (between 0 and 1000000).
 */
library PoolCollectionWithdrawal {
    using MathEx for uint256;

    struct Output {
        Sint256 p;
        Sint256 q;
        Sint256 r;
        uint256 s;
        uint256 t;
        uint256 u;
        uint256 v;
    }

    /**
     * @dev returns `p`, `q`, `r`, `s`, `t`, `u` and `v` according to the current state:
     * +-------------------+-----------------------------------------------------------+
     * | `e > (b+c)/(1-n)` | bootstrap deficit or default deficit or arbitrage deficit |
     * +-------------------+-----------------------------------------------------------+
     * | `e < (b+c)`       | bootstrap surplus or default surplus or arbitrage surplus |
     * +-------------------+-----------------------------------------------------------+
     * | otherwise         | bootstrap surplus or default surplus                      |
     * +-------------------+-----------------------------------------------------------+
     */
    function calculateWithdrawalAmounts(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 w, // <= 2**128-1
        uint256 m, // <= M == 1000000
        uint256 n, // <= M == 1000000
        uint256 x /// <= e <= 2**128-1
    ) internal pure returns (Output memory output) {
        if (
            a > type(uint128).max ||
            b > type(uint128).max ||
            c > type(uint128).max ||
            e > type(uint128).max ||
            w > type(uint128).max ||
            m > M ||
            n > M ||
            x > e
        ) {
            revert PoolCollectionWithdrawalInputInvalid();
        }

        uint256 y = (x * (M - n)) / M;

        if ((e * (M - n)) / M > b + c) {
            uint256 f = (e * (M - n)) / M - (b + c);
            uint256 g = e - (b + c);
            if (isStable(b, c, e, x) && affordableDeficit(b, e, f, g, m, n, x)) {
                output = arbitrageDeficit(a, b, e, f, m, x, y);
            } else if (a > 0) {
                output = defaultDeficit(a, b, c, e, y);
                (output.t, output.u) = externalProtection(a, b, e, g, y, w);
            } else {
                output.s = (y * c) / e;
                (output.t, output.u) = externalProtection(a, b, e, g, y, w);
            }
        } else {
            uint256 f = MathEx.subMax0(b + c, e);
            if (f > 0 && isStable(b, c, e, x) && affordableSurplus(b, e, f, m, n, x)) {
                output = arbitrageSurplus(a, b, e, f, m, n, x, y);
            } else if (a > 0) {
                output = defaultSurplus(a, b, c, y);
            } else {
                output.s = y;
            }
        }

        output.v = x - y;
    }

    /**
     * @dev returns `x < e*c/(b+c)`
     */
    function isStable(
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 x /// <= e <= 2**128-1
    ) private pure returns (bool) {
        return b * x < c * (e - x);
    }

    /**
     * @dev returns `b*e*((e*(1-n)-b-c)*m+e*n) > (e*(1-n)-b-c)*x*(e-b-c)*(1-m)`
     */
    function affordableDeficit(
        uint256, /*b*/ // <= 2**128-1
        uint256, /*e*/ // <= 2**128-1
        uint256, /*f*/ // == e*(1-n)-b-c <= e <= 2**128-1
        uint256, /*g*/ // == e-b-c <= e <= 2**128-1
        uint256, /*m*/ // <= M == 1000000
        uint256, /*n*/ // <= M == 1000000
        uint256 /*x*/ /// <  e*c/(b+c) <= e <= 2**128-1
    ) private pure returns (bool) {
        // temporarily disabled
        //Uint512 memory lhs = MathEx.mul512(b * e, f * m + e * n);
        //Uint512 memory rhs = MathEx.mul512(f * x, g * (M - m));
        //return MathEx.gt512(lhs, rhs);
        return false;
    }

    /**
     * @dev returns `b*e*((b+c-e)*m+e*n) > (b+c-e)*x*(b+c-e*(1-n))*(1-m)`
     */
    function affordableSurplus(
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // == b+c-e <= 2**129-2
        uint256 m, // <= M == 1000000
        uint256 n, // <= M == 1000000
        uint256 x /// <  e*c/(b+c) <= e <= 2**128-1
    ) private pure returns (bool) {
        Uint512 memory lhs = MathEx.mul512(b * e, (f * m + e * n) * M);
        Uint512 memory rhs = MathEx.mul512(f * x, (f * M + e * n) * (M - m));
        return MathEx.gt512(lhs, rhs); // `x < e*c/(b+c)` --> `f*x < e*c*(b+c-e)/(b+c) <= e*c <= 2**256-1`
    }

    /**
     * @dev returns:
     * `p = a*x*(e*(1-n)-b-c)*(1-m)/(b*e-x*(e*(1-n)-b-c)*(1-m))`
     * `q = 0`
     * `r = -x*(e*(1-n)-b-c)/e`
     * `s = x*(1-n)`
     */
    function arbitrageDeficit(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // == e*(1-n)-b-c <= e <= 2**128-1
        uint256 m, // <= M == 1000000
        uint256 x, // <= e <= 2**128-1
        uint256 y /// == x*(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) {
        uint256 i = f * (M - m);
        uint256 j = mulSubMulDivF(b, e * M, x, i, 1);
        output.p = MathEx.mulDivF(a * x, i, j).toPos256();
        output.r = MathEx.mulDivF(x, f, e).toNeg256();
        output.s = y;
    }

    /**
     * @dev returns:
     * `p = -a*x*(b+c-e*(1-n))/(b*e*(1-m)+x*(b+c-e*(1-n))*(1-m))`
     * `q = 0`
     * `r = x*(b+c-e*(1-n))/e`
     * `s = x*(1-n)`
     */
    function arbitrageSurplus(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // == b+c-e <= 2**129-2
        uint256 m, // <= M == 1000000
        uint256 n, // <= M == 1000000
        uint256 x, // <= e <= 2**128-1
        uint256 y /// == x*(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) {
        uint256 i = f * M + e * n;
        uint256 j = mulAddMulDivF(b, e * (M - m), x, i * (M - m), M);
        output.p = MathEx.mulDivF(a * x, i, j).toNeg256();
        output.r = MathEx.mulDivF(x, i, e * M).toPos256();
        output.s = y;
    }

    /**
     * @dev returns:
     * `p = -a*z/(b*e)` where `z = max(x*(1-n)*b-c*(e-x*(1-n)),0)`
     * `q = -a*z/(b*e)` where `z = max(x*(1-n)*b-c*(e-x*(1-n)),0)`
     * `r = -z/e` where `z = max(x*(1-n)*b-c*(e-x*(1-n)),0)`
     * `s = x*(1-n)*(b+c)/e`
     */
    function defaultDeficit(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 y /// == x*(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) {
        uint256 z = MathEx.subMax0(y * b, c * (e - y));
        output.p = MathEx.mulDivF(a, z, b * e).toNeg256();
        output.q = output.p;
        output.r = (z / e).toNeg256();
        output.s = MathEx.mulDivF(y, b + c, e);
    }

    /**
     * @dev returns:
     * `p = -a*z/b` where `z = max(x*(1-n)-c,0)`
     * `q = -a*z/b` where `z = max(x*(1-n)-c,0)`
     * `r = -z` where `z = max(x*(1-n)-c,0)`
     * `s = x*(1-n)`
     */
    function defaultSurplus(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 y /// == x*(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) {
        uint256 z = MathEx.subMax0(y, c);
        output.p = MathEx.mulDivF(a, z, b).toNeg256();
        output.q = output.p;
        output.r = z.toNeg256();
        output.s = y;
    }

    /**
     * @dev returns `t` and `u` according to the current state:
     * +-----------------------+-------+---------------------------+-------------------+
     * | x*(1-n)*(e-b-c)/e > w | a > 0 | t                         | u                 |
     * +-----------------------+-------+---------------------------+-------------------+
     * | true                  | true  | a*(x*(1-n)*(e-b-c)/e-w)/b | w                 |
     * +-----------------------+-------+---------------------------+-------------------+
     * | true                  | false | 0                         | w                 |
     * +-----------------------+-------+---------------------------+-------------------+
     * | false                 | true  | 0                         | x*(1-n)*(e-b-c)/e |
     * +-----------------------+-------+---------------------------+-------------------+
     * | false                 | false | 0                         | x*(1-n)*(e-b-c)/e |
     * +-----------------------+-------+---------------------------+-------------------+
     */
    function externalProtection(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 g, // == e-b-c <= e <= 2**128-1
        uint256 y, // == x*(1-n) <= x <= e <= 2**128-1
        uint256 w /// <= 2**128-1
    ) private pure returns (uint256 t, uint256 u) {
        uint256 yg = y * g;
        uint256 we = w * e;
        if (yg > we) {
            t = a > 0 ? MathEx.mulDivF(a, yg - we, b * e) : 0;
            u = w;
        } else {
            t = 0;
            u = yg / e;
        }
    }

    /**
     * @dev returns `a*b+x*y/z`
     */
    function mulAddMulDivF(
        uint256 a,
        uint256 b,
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (uint256) {
        return a * b + MathEx.mulDivF(x, y, z);
    }

    /**
     * @dev returns `a*b-x*y/z`
     */
    function mulSubMulDivF(
        uint256 a,
        uint256 b,
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (uint256) {
        return a * b - MathEx.mulDivF(x, y, z);
    }
}

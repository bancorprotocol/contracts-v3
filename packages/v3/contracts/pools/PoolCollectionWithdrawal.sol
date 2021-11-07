// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";

import { PPM_RESOLUTION as M } from "../utility/Constants.sol";
import { MathEx } from "../utility/MathEx.sol";

error PoolCollectionWithdrawalInputInvalid();

function validate(bool valid) pure {
    if (!valid) {
        revert PoolCollectionWithdrawalInputInvalid();
    }
}

library PoolCollectionWithdrawal {
    using SafeCast for uint256;
    using SafeMath for uint256;

    struct Output {
        int256 p;
        int256 q;
        int256 r;
        uint256 s;
        uint256 t;
        uint256 u;
        uint256 v;
    }

    struct Uint512 {
        uint256 hi;
        uint256 lo;
    }

    /**
     * @dev returns `p`, `q`, `r`, `s`, `t`, `u` and `v`.
     * when calculating the values of `p`, `q`, `r` and `s`, we split the input range as follows:
     * +---------------------------+--------------------------------------+
     * | `e > (b+c)/(1-n)`         | default deficit or arbitrage deficit |
     * +---------------------------+--------------------------------------+
     * | `e < (b+c)`               | default surplus or arbitrage surplus |
     * +---------------------------+--------------------------------------+
     * | otherwise                 | default surplus                      |
     * +---------------------------+--------------------------------------+
     * we calculate the values of `t` and `u` only when in default deficit.
     */
    // prettier-ignore
    function formula(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 w, // <= 2**128-1
        uint256 m, // <= M == 1000000
        uint256 n, // <= M == 1000000
        uint256 x  // <= e <= 2**128-1
    ) internal pure returns (Output memory output) { unchecked {
        validate(a <= type(uint128).max);
        validate(b <= type(uint128).max);
        validate(c <= type(uint128).max);
        validate(e <= type(uint128).max);
        validate(w <= type(uint128).max);
        validate(m <= M);
        validate(n <= M);
        validate(x <= e);

        uint256 y = x * (M - n) / M;

        if (e * (M - n) / M > b + c) {
            uint256 f = e * (M - n) / M - (b + c);
            uint256 g = e - (b + c);
            if (hlim(b, c, e, x) && hmaxDeficit(b, e, f, g, m, n, x)) {
                output = arbitrageDeficit(a, b, e, f, m, x, y);
            } else {
                output = defaultDeficit(a, b, c, e, y);
                (output.t, output.u) = externalProtection(a, b, e, g, y, w);
            }
        } else {
            uint256 f = MathEx.subMax0(b + c, e);
            if (f > 0 && hlim(b, c, e, x) && hmaxSurplus(b, e, f, m, n, x)) {
                output = arbitrageSurplus(a, b, e, f, m, n, x, y);
            } else {
                output = defaultSurplus(a, b, c, y);
            }
        }

        output.v = x - y;
    }}

    /**
     * @dev returns `b*x < c*(e-x)`
     */
    // prettier-ignore
    function hlim(
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 x  // <= e <= 2**128-1
    ) private pure returns (bool) { unchecked {
        return b * x < c * (e - x);
    }}

    /**
     * @dev returns `b*e*((e*(1-n)-b-c)*m+e*n) > (e*(1-n)-b-c)*x*(e-b-c)*(1-m)`
     */
    // prettier-ignore
    function hmaxDeficit(
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // == e*(1-n)-b-c <= e <= 2**128-1
        uint256 g, // == e-b-c <= e <= 2**128-1
        uint256 m, // <= M == 1000000
        uint256 n, // <= M == 1000000
        uint256 x  // <= e <= 2**128-1
    ) private pure returns (bool) { unchecked {
        return gt512(
            mul512(b * e, f * m + e * n),
            mul512(f * x, g * (M - m))
        );
    }}

    /**
     * @dev returns `b*e*((b+c-e)*m+e*n) > (b+c-e)*x*(b+c-e+e*n)*(1-m)`
     */
    // prettier-ignore
    function hmaxSurplus(
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // <= b+c-e <= 2**129-2
        uint256 m, // <= M == 1000000
        uint256 n, // <= M == 1000000
        uint256 x  // <= e <= 2**128-1
    ) private pure returns (bool) { unchecked {
        return gt512(
            mul512(b * e, (f * m + e * n) * M),
            mul512(f * x, (f * M + e * n) * (M - m))
        );
    }}

    /**
     * @dev returns:
     * `p = a*x(e*(1-n)-b-c)*(1-m)/(b*e-x*(e*(1-n)-b-c)*(1-m))`
     * `q = 0`
     * `r = -x*(e*(1-n)-b-c)/e`
     * `s = x*(1-n)`
     */
    // prettier-ignore
    function arbitrageDeficit(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // == e*(1-n)-b-c <= e <= 2**128-1
        uint256 m, // <= M == 1000000
        uint256 x, // <= e <= 2**128-1
        uint256 y  // == x*(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) { unchecked {
        uint256 h = f * (M - m);
        uint256 k = b.mul(e * M).sub(MathEx.mulDivF(x, h, 1));
        output.p = MathEx.mulDivF(a * x, h, k).toInt256();
        output.q = 0;
        output.r = -MathEx.mulDivF(x, f, e).toInt256();
        output.s = y;
    }}

    /**
     * @dev returns:
     * `p = -a*x(b+c-e+e*n)/(b*e*(1-m)+x*(b+c-e+e*n)*(1-m))`
     * `q = 0`
     * `r = x*(b+c-e+e*n)/e`
     * `s = x*(1-n)`
     */
    // prettier-ignore
    function arbitrageSurplus(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // <= b+c-e <= 2**129-2
        uint256 m, // <= M == 1000000
        uint256 n, // <= M == 1000000
        uint256 x, // <= e <= 2**128-1
        uint256 y  // == x*(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) { unchecked {
        uint256 h = f * M + e * n;
        uint256 k = b.mul(e * (M - m)).add(MathEx.mulDivF(x, h * (M - m), M));
        output.p = -MathEx.mulDivF(a * x, h, k).toInt256();
        output.q = 0;
        output.r = MathEx.mulDivF(x, h, e * M).toInt256();
        output.s = y;
    }}

    /**
     * @dev returns:
     * `p = -a*z/(b*e)` where `z = max(x*(1-n)*b-c*(e-x*(1-n)), 0)`
     * `q = -a*z/(b*e)` where `z = max(x*(1-n)*b-c*(e-x*(1-n)), 0)`
     * `r = -z/e` where `z = max(x*(1-n)*b-c*(e-x*(1-n)), 0)`
     * `s = x*(1-n)*(b+c)/e`
     */
    // prettier-ignore
    function defaultDeficit(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 y  // == x*(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) { unchecked {
        uint256 z = MathEx.subMax0(y * b, c * (e - y));
        output.p = -MathEx.mulDivF(a, z, b * e).toInt256();
        output.q = output.p;
        output.r = -(z / e).toInt256();
        output.s = MathEx.mulDivF(y, b + c, e);
    }}

    /**
     * @dev returns:
     * `p = -a*z/b` where `z = max(x*(1-n)-c, 0)`
     * `q = -a*z/b` where `z = max(x*(1-n)-c, 0)`
     * `r = -z` where `z = max(x*(1-n)-c, 0)`
     * `s = x*(1-n)`
     */
    // prettier-ignore
    function defaultSurplus(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 y  // == x*(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) { unchecked {
        uint256 z = MathEx.subMax0(y, c);
        output.p = -MathEx.mulDivF(a, z, b).toInt256();
        output.q = output.p;
        output.r = -z.toInt256();
        output.s = y;
    }}

    /**
     * @dev returns:
     * +------------------------------+--------------------------------------+-------------------------+
     * | if `w == 0`                  | else if `a*x(1-n)*(e-b-c)/e-w*a > 0` | else                    |
     * +------------------------------+--------------------------------------+-------------------------+
     * | `t = a*x(1-n)*(e-b-c)/(b*e)` | `t = a*x(1-n)*(e-b-c)/(b*e)-w*a/b`   | `t = 0`                 |
     * +------------------------------+--------------------------------------+-------------------------+
     * | `u = 0`                      | `u = w`                              | `u = x*(1-n)*(e-b-c)/e` |
     * +------------------------------+--------------------------------------+-------------------------+
     */
    // prettier-ignore
    function externalProtection(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 g, // == e-b-c <= e <= 2**128-1
        uint256 y, // == x*(1-n) <= x <= e <= 2**128-1
        uint256 w  // <= 2**128-1
    ) private pure returns (uint256 t, uint256 u) { unchecked {
        if (w > 0) {
            uint256 tb = MathEx.mulDivF(a * y, g, e);
            uint256 wa = w * a;
            if (tb > wa) {
                t = (tb - wa) / b;
                u = w;
            } else {
                t = 0;
                u = y * g / e;
            }
        }
        else {
            t = MathEx.mulDivF(a * y, g, b * e);
            u = 0;
        }
    }}

    /**
     * @dev returns the value of `x * y`
     */
    // prettier-ignore
    function mul512(uint256 x, uint256 y) private pure returns (Uint512 memory) { unchecked {
        uint256 p = mulmod(x, y, type(uint256).max);
        uint256 q = x * y;
        uint256 r = p < q ? 1 : 0;
        return Uint512({ hi: p - q - r, lo: q });
    }}

    /**
     * @dev returns the value of `x > y`
     */
    // prettier-ignore
    function gt512(Uint512 memory x, Uint512 memory y) private pure returns (bool) { unchecked {
        return x.hi > y.hi || (x.hi == y.hi && x.lo > y.lo);
    }}
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";

import { PPM_RESOLUTION } from "../utility/Constants.sol";
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

    uint256 private constant M = PPM_RESOLUTION;

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
                output = defaultDeficit(a, b, c, e, g, y);
                if (w > 0) {
                    (output.t, output.u) = externalProtection(a, b, e, g, y, w);
                }
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
     * @dev returns `bx < c(e-x)`
     */
    function hlim(
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 x  // <= e <= 2**128-1
    ) private pure returns (bool) { unchecked {
        return b * x < c * (e - x);
    }}

    /**
     * @dev returns `be((e(1-n)-b-c)m+en) > (e(1-n)-b-c)x(e-b-c)(1-m)`
     */
    function hmaxDeficit(
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // == e(1-n)-b-c <= e <= 2**128-1
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
     * @dev returns `be((b+c-e)m+en) > (b+c-e)x(b+c-e+en)(1-m)`
     */
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
     * `p = ax(e(1-n)-b-c)(1-m)/(be-x(e(1-n)-b-c)(1-m))`
     * `q = 0`
     * `r = -x(e(1-n)-b-c)/e`
     * `s = y`
     * `t = 0`
     */
    function arbitrageDeficit(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // == e(1-n)-b-c <= e <= 2**128-1
        uint256 m, // <= M == 1000000
        uint256 x, // <= e <= 2**128-1
        uint256 y  // == x(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) { unchecked {
        uint256 h = f * (M - m);
        uint256 k = b.mul(e * M).sub(MathEx.mulDivF(x, h, 1));
        output.p = MathEx.mulDivF(a * x, h, k).toInt256();
        output.q = 0;
        output.r = -MathEx.mulDivF(x, f, e).toInt256();
        output.s = y;
        output.t = 0;
    }}

    /**
     * @dev returns:
     * `p = -ax(b+c-e+en)/(be(1-m)+x(b+c-e+en)(1-m))`
     * `q = 0`
     * `r = x(b+c-e+en)/e`
     * `s = y`
     * `t = 0`
     */
    function arbitrageSurplus(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 f, // <= b+c-e <= 2**129-2
        uint256 m, // <= M == 1000000
        uint256 n, // <= M == 1000000
        uint256 x, // <= e <= 2**128-1
        uint256 y  // == x(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) { unchecked {
        uint256 h = f * M + e * n;
        uint256 k = b.mul(e * (M - m)).add(MathEx.mulDivF(x, h * (M - m), M));
        output.p = -MathEx.mulDivF(a * x, h, k).toInt256();
        output.q = 0;
        output.r = MathEx.mulDivF(x, h, e * M).toInt256();
        output.s = y;
        output.t = 0;
    }}

    /**
     * @dev returns:
     * `p = -az/be` where `z = max(x(1-n)b-c(e-x(1-n)), 0)`
     * `q = -az/be` where `z = max(x(1-n)b-c(e-x(1-n)), 0)`
     * `r = -z/e` where `z = max(x(1-n)b-c(e-x(1-n)), 0)`
     * `s = x(1-n)(b+c)/e`
     * `t = ax(1-n)(e-b-c)/be`
     */
    function defaultDeficit(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 g, // == e-b-c <= e <= 2**128-1
        uint256 y  // == x(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) { unchecked {
        uint256 z = MathEx.subMax0(y * b, c * (e - y));
        output.p = -MathEx.mulDivF(a, z, b * e).toInt256();
        output.q = output.p;
        output.r = -(z / e).toInt256();
        output.s = MathEx.mulDivF(y, b + c, e);
        output.t = MathEx.mulDivF(a * y, g, b * e);
    }}

    /**
     * @dev returns:
     * `p = -az/b` where `z = max(x(1-n)-c, 0)`
     * `q = -az/b` where `z = max(x(1-n)-c, 0)`
     * `r = -z` where `z = max(x(1-n)-c, 0)`
     * `s = x(1-n)`
     * `t = 0`
     */
    function defaultSurplus(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 c, // <= 2**128-1
        uint256 y  // == x(1-n) <= x <= e <= 2**128-1
    ) private pure returns (Output memory output) { unchecked {
        uint256 z = MathEx.subMax0(y, c);
        output.p = -MathEx.mulDivF(a, z, b).toInt256();
        output.q = output.p;
        output.r = -z.toInt256();
        output.s = y;
        output.t = 0;
    }}

    /**
     * @dev returns:
     * +-------------------------------+-----------------------+
     * | if `ax(1-n)(e-b-c)/e-wa > 0`  | else                  |
     * +-------------------------------+-----------------------+
     * | `t = (ax(1-n)(e-b-c)/e-wa)/b` | `t = 0`               |
     * +-------------------------------+-----------------------+
     * | `u = w`                       | `u = x(1-n)(e-b-c)/e` |
     * +-------------------------------+-----------------------+
     */
    function externalProtection(
        uint256 a, // <= 2**128-1
        uint256 b, // <= 2**128-1
        uint256 e, // <= 2**128-1
        uint256 g, // == e-b-c <= e <= 2**128-1
        uint256 y, // == x(1-n) <= x <= e <= 2**128-1
        uint256 w  // <= 2**128-1
    ) private pure returns (uint256 t, uint256 u) { unchecked {
        uint256 tb = MathEx.mulDivF(a * y, g, e);
        uint256 wa = w * a;
        if (tb > wa) {
            t = (tb - wa) / b;
            u = w;
        } else {
            t = 0;
            u = y * g / e;
        }
    }}

    /**
     * @dev returns the value of `x * y`
     */
    function mul512(uint256 x, uint256 y) private pure returns (Uint512 memory) { unchecked {
        uint256 p = mulmod(x, y, type(uint256).max);
        uint256 q = x * y;
        uint256 r = p < q ? 1 : 0;
        return Uint512({ hi: p - q - r, lo: q });
    }}

    /**
     * @dev returns the value of `x > y`
     */
    function gt512(Uint512 memory x, Uint512 memory y) private pure returns (bool) { unchecked {
        return x.hi > y.hi || (x.hi == y.hi && x.lo > y.lo);
    }}
}

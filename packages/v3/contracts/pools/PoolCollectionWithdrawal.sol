// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";

import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { MathEx } from "../utility/MathEx.sol";

/**
 * @dev this library provides mathematical support for base token withdrawal
 */
library PoolCollectionWithdrawal {
    using SafeCast for uint256;
    using SafeMath for uint256;

    uint256 private constant M = PPM_RESOLUTION;

    struct Output {
        int256 p; // network token amount removed from the trading liquidity
        int256 q; // network token amount renounced by the protocol
        int256 r; // base token amount removed from the trading liquidity
        uint256 s; // base token amount removed from the vault
        uint256 t; // network token amount sent to the provider
        uint256 u; // base token amount removed from the external protection wallet
    }

    struct Uint512 {
        uint256 hi;
        uint256 lo;
    }

    function withdrawalOutput(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 w,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (Output memory output) { unchecked {
        assert(a <= type(uint128).max);
        assert(b <= type(uint128).max);
        assert(c <= type(uint128).max);
        assert(e <= type(uint128).max);
        assert(w <= type(uint128).max);
        assert(m <= M);
        assert(n <= M);
        assert(x <= e);

        uint256 y = x * (M - n) / M;

        if (e * (M - n) / M > b + c) {
            uint256 f = e * (M - n) / M - (b + c);
            uint256 g = e - (b + c);
            if (hlim(b, c, e, x) && deficitHmax(b, e, f, g, m, n, x)) {
                output = deficitArbitrage(a, b, e, f, m, x, y);
            } else {
                output = deficitDefault(a, b, c, e, g, y, MathEx.subMax0(y * b, c * (e - y)));
            }
        } else {
            uint256 f = MathEx.subMax0(b + c, e);
            if (f > 0 && hlim(b, c, e, x) && surplusHmax(b, e, f, m, n, x)) {
                output = surplusArbitrage(a, b, e, f, m, n, x, y);
            } else {
                output = surplusDefault(a, b, y, MathEx.subMax0(y, c));
            }
        }

        if (output.t > 0 && w > 0) {
            assert(output.t <= type(uint128).max);
            uint256 tb = output.t * b;
            uint256 wa = w * a;
            if (tb > wa) {
                output.t = (tb - wa) / b;
                output.u = w;
            } else {
                output.t = 0;
                output.u = tb / a;
            }
        }
    }}

    function hlim(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 x
    ) private pure returns (bool) { unchecked {
        return b * x < c * (e - x);
    }}

    function deficitHmax(
        uint256 b,
        uint256 e,
        uint256 f,
        uint256 g,
        uint256 m,
        uint256 n,
        uint256 x
    ) private pure returns (bool) { unchecked {
        return gt512(
            mul512(b * e, f * m + e * n),
            mul512(f * x, g * (M - m))
        );
    }}

    function surplusHmax(
        uint256 b,
        uint256 e,
        uint256 f,
        uint256 m,
        uint256 n,
        uint256 x
    ) private pure returns (bool) { unchecked {
        return gt512(
            mul512(b * e, (f * m + e * n) * M),
            mul512(f * x, (f * M + e * n) * (M - m))
        );
    }}

    function deficitArbitrage(
        uint256 a,
        uint256 b,
        uint256 e,
        uint256 f,
        uint256 m,
        uint256 x,
        uint256 y
    ) private pure returns (Output memory output) { unchecked {
        uint256 h = f * (M - m);
        output.p = MathEx.mulDivF(a * x, h, b.mul(e * M).sub(x.mul(h))).toInt256();
        output.q = 0;
        output.r = -MathEx.mulDivF(x, f, e).toInt256();
        output.s = y;
        output.t = 0;
    }}

    function surplusArbitrage(
        uint256 a,
        uint256 b,
        uint256 e,
        uint256 f,
        uint256 m,
        uint256 n,
        uint256 x,
        uint256 y
    ) private pure returns (Output memory output) { unchecked {
        uint256 h = f * M + e * n;
        output.p = -MathEx.mulDivF(a * x, h * M, b.mul(e * M).add(x.mul(h)).mul(M - m)).toInt256();
        output.q = 0;
        output.r = MathEx.mulDivF(x, h, e * M).toInt256();
        output.s = y;
        output.t = 0;
    }}

    function deficitDefault(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 g,
        uint256 y,
        uint256 z
    ) private pure returns (Output memory output) { unchecked {
        output.p = -MathEx.mulDivF(a, z, b * e).toInt256();
        output.q = output.p;
        output.r = -(z / e).toInt256();
        output.s = MathEx.mulDivF(y, b + c, e);
        output.t = MathEx.mulDivF(a * y, g, b * e);
    }}

    function surplusDefault(
        uint256 a,
        uint256 b,
        uint256 y,
        uint256 z
    ) private pure returns (Output memory output) { unchecked {
        output.p = -MathEx.mulDivF(a, z, b).toInt256();
        output.q = output.p;
        output.r = -z.toInt256();
        output.s = y;
        output.t = 0;
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

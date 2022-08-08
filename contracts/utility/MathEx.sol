// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Fraction, InvalidFraction } from "./Fraction.sol";

import { PPM_RESOLUTION } from "./Constants.sol";

uint256 constant ONE = 0x80000000000000000000000000000000;
uint256 constant LN2 = 0x58b90bfbe8e7bcd5e4f1d9cc01f97b57;

struct Uint512 {
    uint256 hi; // 256 most significant bits
    uint256 lo; // 256 least significant bits
}

struct Sint256 {
    uint256 value;
    bool isNeg;
}

/**
 * @dev this library provides a set of complex math operations
 */
library MathEx {
    error Overflow();

    /**
     * @dev returns `2 ^ f` by calculating `e ^ (f * ln(2))`, where `e` is Euler's number:
     * - Rewrite the input as a sum of binary exponents and a single residual r, as small as possible
     * - The exponentiation of each binary exponent is given (pre-calculated)
     * - The exponentiation of r is calculated via Taylor series for e^x, where x = r
     * - The exponentiation of the input is calculated by multiplying the intermediate results above
     * - For example: e^5.521692859 = e^(4 + 1 + 0.5 + 0.021692859) = e^4 * e^1 * e^0.5 * e^0.021692859
     */
    function exp2(Fraction memory f) internal pure returns (Fraction memory) {
        uint256 x = MathEx.mulDivF(LN2, f.n, f.d);
        uint256 y;
        uint256 z;
        uint256 n;

        if (x >= (ONE << 4)) {
            revert Overflow();
        }

        unchecked {
            z = y = x % (ONE >> 3); // get the input modulo 2^(-3)
            z = (z * y) / ONE;
            n += z * 0x10e1b3be415a0000; // add y^02 * (20! / 02!)
            z = (z * y) / ONE;
            n += z * 0x05a0913f6b1e0000; // add y^03 * (20! / 03!)
            z = (z * y) / ONE;
            n += z * 0x0168244fdac78000; // add y^04 * (20! / 04!)
            z = (z * y) / ONE;
            n += z * 0x004807432bc18000; // add y^05 * (20! / 05!)
            z = (z * y) / ONE;
            n += z * 0x000c0135dca04000; // add y^06 * (20! / 06!)
            z = (z * y) / ONE;
            n += z * 0x0001b707b1cdc000; // add y^07 * (20! / 07!)
            z = (z * y) / ONE;
            n += z * 0x000036e0f639b800; // add y^08 * (20! / 08!)
            z = (z * y) / ONE;
            n += z * 0x00000618fee9f800; // add y^09 * (20! / 09!)
            z = (z * y) / ONE;
            n += z * 0x0000009c197dcc00; // add y^10 * (20! / 10!)
            z = (z * y) / ONE;
            n += z * 0x0000000e30dce400; // add y^11 * (20! / 11!)
            z = (z * y) / ONE;
            n += z * 0x000000012ebd1300; // add y^12 * (20! / 12!)
            z = (z * y) / ONE;
            n += z * 0x0000000017499f00; // add y^13 * (20! / 13!)
            z = (z * y) / ONE;
            n += z * 0x0000000001a9d480; // add y^14 * (20! / 14!)
            z = (z * y) / ONE;
            n += z * 0x00000000001c6380; // add y^15 * (20! / 15!)
            z = (z * y) / ONE;
            n += z * 0x000000000001c638; // add y^16 * (20! / 16!)
            z = (z * y) / ONE;
            n += z * 0x0000000000001ab8; // add y^17 * (20! / 17!)
            z = (z * y) / ONE;
            n += z * 0x000000000000017c; // add y^18 * (20! / 18!)
            z = (z * y) / ONE;
            n += z * 0x0000000000000014; // add y^19 * (20! / 19!)
            z = (z * y) / ONE;
            n += z * 0x0000000000000001; // add y^20 * (20! / 20!)
            n = n / 0x21c3677c82b40000 + y + ONE; // divide by 20! and then add y^1 / 1! + y^0 / 0!

            if ((x & (ONE >> 3)) != 0)
                n = (n * 0x1c3d6a24ed82218787d624d3e5eba95f9) / 0x18ebef9eac820ae8682b9793ac6d1e776; // multiply by e^(2^-3)
            if ((x & (ONE >> 2)) != 0)
                n = (n * 0x18ebef9eac820ae8682b9793ac6d1e778) / 0x1368b2fc6f9609fe7aceb46aa619baed4; // multiply by e^(2^-2)
            if ((x & (ONE >> 1)) != 0)
                n = (n * 0x1368b2fc6f9609fe7aceb46aa619baed5) / 0x0bc5ab1b16779be3575bd8f0520a9f21f; // multiply by e^(2^-1)
            if ((x & (ONE << 0)) != 0)
                n = (n * 0x0bc5ab1b16779be3575bd8f0520a9f21e) / 0x0454aaa8efe072e7f6ddbab84b40a55c9; // multiply by e^(2^+0)
            if ((x & (ONE << 1)) != 0)
                n = (n * 0x0454aaa8efe072e7f6ddbab84b40a55c5) / 0x00960aadc109e7a3bf4578099615711ea; // multiply by e^(2^+1)
            if ((x & (ONE << 2)) != 0)
                n = (n * 0x00960aadc109e7a3bf4578099615711d7) / 0x0002bf84208204f5977f9a8cf01fdce3d; // multiply by e^(2^+2)
            if ((x & (ONE << 3)) != 0)
                n = (n * 0x0002bf84208204f5977f9a8cf01fdc307) / 0x0000003c6ab775dd0b95b4cbee7e65d11; // multiply by e^(2^+3)
        }

        return Fraction({ n: n, d: ONE });
    }

    /**
     * @dev returns a fraction with truncated components
     * note that since the input value is truncated, the use of the method incurs precision loss
     */
    function truncatedFraction(Fraction memory fraction, uint256 max) internal pure returns (Fraction memory) {
        uint256 scale = Math.ceilDiv(Math.max(fraction.n, fraction.d), max);
        Fraction memory truncated = Fraction({ n: fraction.n / scale, d: fraction.d / scale });
        if (truncated.d == 0) {
            revert InvalidFraction();
        }

        return truncated;
    }

    /**
     * @dev returns the weighted average of two fractions
     */
    function weightedAverage(
        Fraction memory fraction1,
        Fraction memory fraction2,
        uint256 weight1,
        uint256 weight2
    ) internal pure returns (Fraction memory) {
        return
            Fraction({
                n: fraction1.n * fraction2.d * weight1 + fraction1.d * fraction2.n * weight2,
                d: fraction1.d * fraction2.d * (weight1 + weight2)
            });
    }

    /**
     * @dev returns whether or not the deviation of an offset sample from a base sample is within a permitted range
     * for example, if the maximum permitted deviation is 5%, then evaluate `95% * base <= offset <= 105% * base`
     */
    function isInRange(
        Fraction memory baseSample,
        Fraction memory offsetSample,
        uint32 maxDeviationPPM
    ) internal pure returns (bool) {
        Uint512 memory min = mul512(baseSample.n, offsetSample.d * (PPM_RESOLUTION - maxDeviationPPM));
        Uint512 memory mid = mul512(baseSample.d, offsetSample.n * PPM_RESOLUTION);
        Uint512 memory max = mul512(baseSample.n, offsetSample.d * (PPM_RESOLUTION + maxDeviationPPM));
        return lte512(min, mid) && lte512(mid, max);
    }

    /**
     * @dev returns an `Sint256` positive representation of an unsigned integer
     */
    function toPos256(uint256 n) internal pure returns (Sint256 memory) {
        return Sint256({ value: n, isNeg: false });
    }

    /**
     * @dev returns an `Sint256` negative representation of an unsigned integer
     */
    function toNeg256(uint256 n) internal pure returns (Sint256 memory) {
        return Sint256({ value: n, isNeg: true });
    }

    /**
     * @dev returns the largest integer smaller than or equal to `x * y / z`
     */
    function mulDivF(
        uint256 x,
        uint256 y,
        uint256 z
    ) internal pure returns (uint256) {
        Uint512 memory xy = mul512(x, y);

        // if `x * y < 2 ^ 256`
        if (xy.hi == 0) {
            return xy.lo / z;
        }

        // assert `x * y / z < 2 ^ 256`
        if (xy.hi >= z) {
            revert Overflow();
        }

        uint256 m = _mulMod(x, y, z); // `m = x * y % z`
        Uint512 memory n = _sub512(xy, m); // `n = x * y - m` hence `n / z = floor(x * y / z)`

        // if `n < 2 ^ 256`
        if (n.hi == 0) {
            return n.lo / z;
        }

        uint256 p = _unsafeSub(0, z) & z; // `p` is the largest power of 2 which `z` is divisible by
        uint256 q = _div512(n, p); // `n` is divisible by `p` because `n` is divisible by `z` and `z` is divisible by `p`
        uint256 r = _inv256(z / p); // `z / p = 1 mod 2` hence `inverse(z / p) = 1 mod 2 ^ 256`
        return _unsafeMul(q, r); // `q * r = (n / p) * inverse(z / p) = n / z`
    }

    /**
     * @dev returns the smallest integer larger than or equal to `x * y / z`
     */
    function mulDivC(
        uint256 x,
        uint256 y,
        uint256 z
    ) internal pure returns (uint256) {
        uint256 w = mulDivF(x, y, z);
        if (_mulMod(x, y, z) > 0) {
            if (w >= type(uint256).max) {
                revert Overflow();
            }

            return w + 1;
        }
        return w;
    }

    /**
     * @dev returns the maximum of `n1 - n2` and 0
     */
    function subMax0(uint256 n1, uint256 n2) internal pure returns (uint256) {
        return n1 > n2 ? n1 - n2 : 0;
    }

    /**
     * @dev returns the value of `x > y`
     */
    function gt512(Uint512 memory x, Uint512 memory y) internal pure returns (bool) {
        return x.hi > y.hi || (x.hi == y.hi && x.lo > y.lo);
    }

    /**
     * @dev returns the value of `x < y`
     */
    function lt512(Uint512 memory x, Uint512 memory y) internal pure returns (bool) {
        return x.hi < y.hi || (x.hi == y.hi && x.lo < y.lo);
    }

    /**
     * @dev returns the value of `x >= y`
     */
    function gte512(Uint512 memory x, Uint512 memory y) internal pure returns (bool) {
        return !lt512(x, y);
    }

    /**
     * @dev returns the value of `x <= y`
     */
    function lte512(Uint512 memory x, Uint512 memory y) internal pure returns (bool) {
        return !gt512(x, y);
    }

    /**
     * @dev returns the value of `x * y`
     */
    function mul512(uint256 x, uint256 y) internal pure returns (Uint512 memory) {
        uint256 p = _mulModMax(x, y);
        uint256 q = _unsafeMul(x, y);
        if (p >= q) {
            return Uint512({ hi: p - q, lo: q });
        }
        return Uint512({ hi: _unsafeSub(p, q) - 1, lo: q });
    }

    /**
     * @dev returns the value of `x - y`, given that `x >= y`
     */
    function _sub512(Uint512 memory x, uint256 y) private pure returns (Uint512 memory) {
        if (x.lo >= y) {
            return Uint512({ hi: x.hi, lo: x.lo - y });
        }
        return Uint512({ hi: x.hi - 1, lo: _unsafeSub(x.lo, y) });
    }

    /**
     * @dev returns the value of `x / pow2n`, given that `x` is divisible by `pow2n`
     */
    function _div512(Uint512 memory x, uint256 pow2n) private pure returns (uint256) {
        uint256 pow2nInv = _unsafeAdd(_unsafeSub(0, pow2n) / pow2n, 1); // `1 << (256 - n)`
        return _unsafeMul(x.hi, pow2nInv) | (x.lo / pow2n); // `(x.hi << (256 - n)) | (x.lo >> n)`
    }

    /**
     * @dev returns the inverse of `d` modulo `2 ^ 256`, given that `d` is congruent to `1` modulo `2`
     */
    function _inv256(uint256 d) private pure returns (uint256) {
        // approximate the root of `f(x) = 1 / x - d` using the newton–raphson convergence method
        uint256 x = 1;
        for (uint256 i = 0; i < 8; i++) {
            x = _unsafeMul(x, _unsafeSub(2, _unsafeMul(x, d))); // `x = x * (2 - x * d) mod 2 ^ 256`
        }
        return x;
    }

    /**
     * @dev returns `(x + y) % 2 ^ 256`
     */
    function _unsafeAdd(uint256 x, uint256 y) private pure returns (uint256) {
        unchecked {
            return x + y;
        }
    }

    /**
     * @dev returns `(x - y) % 2 ^ 256`
     */
    function _unsafeSub(uint256 x, uint256 y) private pure returns (uint256) {
        unchecked {
            return x - y;
        }
    }

    /**
     * @dev returns `(x * y) % 2 ^ 256`
     */
    function _unsafeMul(uint256 x, uint256 y) private pure returns (uint256) {
        unchecked {
            return x * y;
        }
    }

    /**
     * @dev returns `x * y % (2 ^ 256 - 1)`
     */
    function _mulModMax(uint256 x, uint256 y) private pure returns (uint256) {
        return mulmod(x, y, type(uint256).max);
    }

    /**
     * @dev returns `x * y % z`
     */
    function _mulMod(
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (uint256) {
        return mulmod(x, y, z);
    }
}

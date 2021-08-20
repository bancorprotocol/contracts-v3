// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { MAX_UINT256 } from "./Constants.sol";
import { Fraction } from "./Types.sol";

/**
 * @dev this library provides a set of complex math operations
 */
library MathEx {
    /**
     * @dev returns the largest integer smaller than or equal to the square root of a positive integer
     */
    function floorSqrt(uint256 n) internal pure returns (uint256) {
        uint256 x = n / 2 + 1;
        uint256 y = (x + n / x) / 2;
        while (x > y) {
            x = y;
            y = (x + n / x) / 2;
        }
        return x;
    }

    /**
     * @dev returns the smallest integer larger than or equal to the square root of a positive integer
     */
    function ceilSqrt(uint256 n) internal pure returns (uint256) {
        uint256 x = floorSqrt(n);
        return x * x == n ? x : x + 1;
    }

    /**
     * @dev computes the product of two given ratios
     */
    function productRatio(Fraction memory x, Fraction memory y) internal pure returns (Fraction memory) {
        uint256 n = mulDivC(x.n, y.n, MAX_UINT256);
        uint256 d = mulDivC(x.d, y.d, MAX_UINT256);
        uint256 z = n > d ? n : d;
        if (z > 1) {
            return Fraction({ n: mulDivC(x.n, y.n, z), d: mulDivC(x.d, y.d, z) });
        }
        return Fraction({ n: x.n * y.n, d: x.d * y.d });
    }

    /**
     * @dev computes a reduced-scalar ratio
     */
    function reducedRatio(Fraction memory r, uint256 max) internal pure returns (Fraction memory) {
        Fraction memory newR = r;
        if (newR.n > max || newR.d > max) {
            newR = normalizedRatio(newR, max);
        }

        if (newR.n != newR.d) {
            return newR;
        }

        return Fraction({ n: 1, d: 1 });
    }

    /**
     * @dev computes "scale * r.n / (r.n + r.d)" and "scale * r.d / (r.n + r.d)".
     */
    function normalizedRatio(Fraction memory r, uint256 scale) internal pure returns (Fraction memory) {
        if (r.n <= r.d) {
            return accurateRatio(r, scale);
        }

        return _inv(accurateRatio(_inv(r), scale));
    }

    /**
     * @dev computes "scale * r.n / (r.n + r.d)" and "scale * r.d / (r.n + r.d)", assuming that "r.n <= r.d".
     */
    function accurateRatio(Fraction memory r, uint256 scale) internal pure returns (Fraction memory) {
        uint256 maxVal = MAX_UINT256 / scale;
        Fraction memory ratio = r;
        if (r.n > maxVal) {
            uint256 c = r.n / (maxVal + 1) + 1;

            // we can now safely compute `r.n * scale`
            ratio.n /= c;
            ratio.d /= c;
        }

        if (ratio.n != ratio.d) {
            Fraction memory newRatio = Fraction({ n: ratio.n * scale, d: unsafeAdd(ratio.n, ratio.d) });

            if (newRatio.d >= ratio.n) {
                // no overflow in `ratio.n + ratio.d`
                uint256 x = roundDiv(newRatio.n, newRatio.d);

                // we can now safely compute `scale - x`
                uint256 y = scale - x;

                return Fraction({ n: x, d: y });
            }

            if (newRatio.n < ratio.d - (ratio.d - ratio.n) / 2) {
                // `ratio.n * scale < (ratio.n + ratio.d) / 2 < MAX_UINT256 < ratio.n + ratio.d`
                return Fraction({ n: 0, d: scale });
            }

            // `(ratio.n + ratio.d) / 2 < ratio.n * scale < MAX_UINT256 < ratio.n + ratio.d`
            return Fraction({ n: 1, d: scale - 1 });
        }

        // allow reduction to `(1, 1)` in the calling function
        return Fraction({ n: scale / 2, d: scale / 2 });
    }

    /**
     * @dev computes the nearest integer to a given quotient without overflowing or underflowing.
     */
    function roundDiv(uint256 n, uint256 d) internal pure returns (uint256) {
        return n / d + (n % d) / (d - d / 2);
    }

    /**
     * @dev returns the largest integer smaller than or equal to `x * y / z`
     */
    function mulDivF(
        uint256 x,
        uint256 y,
        uint256 z
    ) internal pure returns (uint256) {
        (uint256 xyh, uint256 xyl) = mul512(x, y);

        // if `x * y < 2 ^ 256`
        if (xyh == 0) {
            return xyl / z;
        }

        // assert `x * y / z < 2 ^ 256`
        require(xyh < z, "ERR_OVERFLOW");

        uint256 m = mulMod(x, y, z); // `m = x * y % z`
        (uint256 nh, uint256 nl) = sub512(xyh, xyl, m); // `n = x * y - m` hence `n / z = floor(x * y / z)`

        // if `n < 2 ^ 256`
        if (nh == 0) {
            return nl / z;
        }

        uint256 p = unsafeSub(0, z) & z; // `p` is the largest power of 2 which `z` is divisible by
        uint256 q = div512(nh, nl, p); // `n` is divisible by `p` because `n` is divisible by `z` and `z` is divisible by `p`
        uint256 r = inv256(z / p); // `z / p = 1 mod 2` hence `inverse(z / p) = 1 mod 2 ^ 256`
        return unsafeMul(q, r); // `q * r = (n / p) * inverse(z / p) = n / z`
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
        if (mulMod(x, y, z) > 0) {
            require(w < MAX_UINT256, "ERR_OVERFLOW");
            return w + 1;
        }
        return w;
    }

    /**
     * @dev returns the value of `x * y` as a pair of 256-bit values
     */
    function mul512(uint256 x, uint256 y) private pure returns (uint256, uint256) {
        uint256 p = mulModMax(x, y);
        uint256 q = unsafeMul(x, y);
        if (p >= q) {
            return (p - q, q);
        }
        return (unsafeSub(p, q) - 1, q);
    }

    /**
     * @dev returns the value of `2 ^ 256 * xh + xl - y`, where `2 ^ 256 * xh + xl >= y`
     */
    function sub512(
        uint256 xh,
        uint256 xl,
        uint256 y
    ) private pure returns (uint256, uint256) {
        if (xl >= y) {
            return (xh, xl - y);
        }
        return (xh - 1, unsafeSub(xl, y));
    }

    /**
     * @dev returns the value of `(2 ^ 256 * xh + xl) / pow2n`, where `xl` is divisible by `pow2n`
     */
    function div512(
        uint256 xh,
        uint256 xl,
        uint256 pow2n
    ) private pure returns (uint256) {
        uint256 pow2nInv = unsafeAdd(unsafeSub(0, pow2n) / pow2n, 1); // `1 << (256 - n)`
        return unsafeMul(xh, pow2nInv) | (xl / pow2n); // `(xh << (256 - n)) | (xl >> n)`
    }

    /**
     * @dev returns the inverse of `d` modulo `2 ^ 256`, where `d` is congruent to `1` modulo `2`
     */
    function inv256(uint256 d) private pure returns (uint256) {
        // approximate the root of `f(x) = 1 / x - d` using the newton–raphson convergence method
        uint256 x = 1;
        for (uint256 i = 0; i < 8; i++) {
            x = unsafeMul(x, unsafeSub(2, unsafeMul(x, d))); // `x = x * (2 - x * d) mod 2 ^ 256`
        }
        return x;
    }

    /**
     * @dev returns `(x + y) % 2 ^ 256`
     */
    function unsafeAdd(uint256 x, uint256 y) private pure returns (uint256) {
        return x + y;
    }

    /**
     * @dev returns `(x - y) % 2 ^ 256`
     */
    function unsafeSub(uint256 x, uint256 y) private pure returns (uint256) {
        return x - y;
    }

    /**
     * @dev returns `(x * y) % 2 ^ 256`
     */
    function unsafeMul(uint256 x, uint256 y) private pure returns (uint256) {
        return x * y;
    }

    /**
     * @dev returns `x * y % (2 ^ 256 - 1)`
     */
    function mulModMax(uint256 x, uint256 y) private pure returns (uint256) {
        return mulmod(x, y, MAX_UINT256);
    }

    /**
     * @dev returns `x * y % z`
     */
    function mulMod(
        uint256 x,
        uint256 y,
        uint256 z
    ) private pure returns (uint256) {
        return mulmod(x, y, z);
    }

    /**
     * @dev returns the inverse of a given fraction
     */
    function _inv(Fraction memory r) private pure returns (Fraction memory) {
        return Fraction({ n: r.d, d: r.n });
    }
}

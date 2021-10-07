// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { Fraction } from "./Types.sol";

error Overflow();

/**
 * @dev an unchecked version of i++
 */
// solhint-disable-next-line func-visibility
function uncheckedInc(uint256 i) pure returns (uint256) {
    unchecked {
        return i + 1;
    }
}

/**
 * @dev this library provides a set of complex math operations
 */
library MathEx {
    /**
     * @dev returns the largest integer smaller than or equal to the square root of a positive integer
     */
    function floorSqrt(uint256 n) internal pure returns (uint256) {
        unchecked {
            uint256 x = n / 2 + 1;
            uint256 y = (x + n / x) / 2;
            while (x > y) {
                x = y;
                y = (x + n / x) / 2;
            }
            return x;
        }
    }

    /**
     * @dev returns the smallest integer larger than or equal to the square root of a positive integer
     */
    function ceilSqrt(uint256 n) internal pure returns (uint256) {
        unchecked {
            uint256 x = floorSqrt(n);
            return x * x == n ? x : x + 1;
        }
    }

    /**
     * @dev computes the product of two given ratios
     */
    function productRatio(Fraction memory x, Fraction memory y) internal pure returns (Fraction memory) {
        unchecked {
            uint256 n = mulDivC(x.n, y.n, type(uint256).max);
            uint256 d = mulDivC(x.d, y.d, type(uint256).max);
            uint256 z = n > d ? n : d;
            if (z > 1) {
                return Fraction({ n: mulDivC(x.n, y.n, z), d: mulDivC(x.d, y.d, z) });
            }
            return Fraction({ n: x.n * y.n, d: x.d * y.d });
        }
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
        unchecked {
            uint256 maxVal = type(uint256).max / scale;
            Fraction memory ratio = r;
            if (r.n > maxVal) {
                uint256 c = r.n / (maxVal + 1) + 1;

                // we can now safely compute `r.n * scale`
                ratio.n /= c;
                ratio.d /= c;
            }

            if (ratio.n != ratio.d) {
                Fraction memory newRatio = Fraction({ n: ratio.n * scale, d: _unsafeAdd(ratio.n, ratio.d) });

                if (newRatio.d >= ratio.n) {
                    // no overflow in `ratio.n + ratio.d`
                    uint256 x = roundDiv(newRatio.n, newRatio.d);

                    // we can now safely compute `scale - x`
                    uint256 y = scale - x;

                    return Fraction({ n: x, d: y });
                }

                if (newRatio.n < ratio.d - (ratio.d - ratio.n) / 2) {
                    // `ratio.n * scale < (ratio.n + ratio.d) / 2 < type(uint256).max < ratio.n + ratio.d`
                    return Fraction({ n: 0, d: scale });
                }

                // `(ratio.n + ratio.d) / 2 < ratio.n * scale < type(uint256).max < ratio.n + ratio.d`
                return Fraction({ n: 1, d: scale - 1 });
            }

            // allow reduction to `(1, 1)` in the calling function
            return Fraction({ n: scale / 2, d: scale / 2 });
        }
    }

    /**
     * @dev computes the nearest integer to a given quotient without overflowing or underflowing.
     */
    function roundDiv(uint256 n, uint256 d) internal pure returns (uint256) {
        unchecked {
            return n / d + (n % d) / (d - d / 2);
        }
    }

    /**
     * @dev returns the largest integer smaller than or equal to `x * y / z`
     */
    function mulDivF(
        uint256 x,
        uint256 y,
        uint256 z
    ) internal pure returns (uint256) {
        unchecked {
            (uint256 xyh, uint256 xyl) = _mul512(x, y);

            // if `x * y < 2 ^ 256`
            if (xyh == 0) {
                return xyl / z;
            }

            // assert `x * y / z < 2 ^ 256`
            if (xyh >= z) {
                revert Overflow();
            }

            uint256 m = _mulMod(x, y, z); // `m = x * y % z`
            (uint256 nh, uint256 nl) = _sub512(xyh, xyl, m); // `n = x * y - m` hence `n / z = floor(x * y / z)`

            // if `n < 2 ^ 256`
            if (nh == 0) {
                return nl / z;
            }

            uint256 p = _unsafeSub(0, z) & z; // `p` is the largest power of 2 which `z` is divisible by
            uint256 q = _div512(nh, nl, p); // `n` is divisible by `p` because `n` is divisible by `z` and `z` is divisible by `p`
            uint256 r = _inv256(z / p); // `z / p = 1 mod 2` hence `inverse(z / p) = 1 mod 2 ^ 256`
            return _unsafeMul(q, r); // `q * r = (n / p) * inverse(z / p) = n / z`
        }
    }

    /**
     * @dev returns the smallest integer larger than or equal to `x * y / z`
     */
    function mulDivC(
        uint256 x,
        uint256 y,
        uint256 z
    ) internal pure returns (uint256) {
        unchecked {
            uint256 w = mulDivF(x, y, z);
            if (_mulMod(x, y, z) > 0) {
                if (w >= type(uint256).max) {
                    revert Overflow();
                }

                return w + 1;
            }
            return w;
        }
    }

    /**
     * @dev returns the maximum of `n1 - n2` and 0
     */
    function subMax0(uint256 n1, uint256 n2) internal pure returns (uint256) {
        return n1 > n2 ? n1 - n2 : 0;
    }

    /**
     * @dev returns the value of `x * y` as a pair of 256-bit values
     */
    function _mul512(uint256 x, uint256 y) private pure returns (uint256, uint256) {
        unchecked {
            uint256 p = _mulModMax(x, y);
            uint256 q = _unsafeMul(x, y);
            if (p >= q) {
                return (p - q, q);
            }
            return (_unsafeSub(p, q) - 1, q);
        }
    }

    /**
     * @dev returns the value of `2 ^ 256 * xh + xl - y`, where `2 ^ 256 * xh + xl >= y`
     */
    function _sub512(
        uint256 xh,
        uint256 xl,
        uint256 y
    ) private pure returns (uint256, uint256) {
        unchecked {
            if (xl >= y) {
                return (xh, xl - y);
            }
            return (xh - 1, _unsafeSub(xl, y));
        }
    }

    /**
     * @dev returns the value of `(2 ^ 256 * xh + xl) / pow2n`, where `xl` is divisible by `pow2n`
     */
    function _div512(
        uint256 xh,
        uint256 xl,
        uint256 pow2n
    ) private pure returns (uint256) {
        unchecked {
            uint256 pow2nInv = _unsafeAdd(_unsafeSub(0, pow2n) / pow2n, 1); // `1 << (256 - n)`
            return _unsafeMul(xh, pow2nInv) | (xl / pow2n); // `(xh << (256 - n)) | (xl >> n)`
        }
    }

    /**
     * @dev returns the inverse of `d` modulo `2 ^ 256`, where `d` is congruent to `1` modulo `2`
     */
    function _inv256(uint256 d) private pure returns (uint256) {
        unchecked {
            // approximate the root of `f(x) = 1 / x - d` using the newton–raphson convergence method
            uint256 x = 1;
            for (uint256 i = 0; i < 8; i++) {
                x = _unsafeMul(x, _unsafeSub(2, _unsafeMul(x, d))); // `x = x * (2 - x * d) mod 2 ^ 256`
            }
            return x;
        }
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

    /**
     * @dev returns the inverse of a given fraction
     */
    function _inv(Fraction memory r) private pure returns (Fraction memory) {
        return Fraction({ n: r.d, d: r.n });
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { Fraction, Uint512, Sint256 } from "./Types.sol";

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
     * @dev returns the largest integer smaller than or equal to the square root of an unsigned integer
     */
    function floorSqrt(uint256 n) internal pure returns (uint256) {
        unchecked {
            if (n == 0) {
                return 0;
            }
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
        unchecked {
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
        unchecked {
            return n1 > n2 ? n1 - n2 : 0;
        }
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
    function mul512(uint256 x, uint256 y) private pure returns (Uint512 memory) {
        unchecked {
            uint256 p = _mulModMax(x, y);
            uint256 q = _unsafeMul(x, y);
            if (p >= q) {
                return Uint512({ hi: p - q, lo: q });
            }
            return Uint512({ hi: _unsafeSub(p, q) - 1, lo: q });
        }
    }

    /**
     * @dev returns the value of `2 ^ x - y`, given that `2 ^ x >= y`
     */
    function _sub512(
        Uint512 memory x,
        uint256 y
    ) private pure returns (Uint512 memory) {
        unchecked {
            if (x.lo >= y) {
                return Uint512({ hi: x.hi, lo: x.lo - y });
            }
            return Uint512({ hi: x.hi - 1, lo: _unsafeSub(x.lo, y) });
        }
    }

    /**
     * @dev returns the value of `2 ^ x / pow2n`, given that `x` is divisible by `pow2n`
     */
    function _div512(
        Uint512 memory x,
        uint256 pow2n
    ) private pure returns (uint256) {
        unchecked {
            uint256 pow2nInv = _unsafeAdd(_unsafeSub(0, pow2n) / pow2n, 1); // `1 << (256 - n)`
            return _unsafeMul(x.hi, pow2nInv) | (x.lo / pow2n); // `(x.hi << (256 - n)) | (x.lo >> n)`
        }
    }

    /**
     * @dev returns the inverse of `d` modulo `2 ^ 256`, given that `d` is congruent to `1` modulo `2`
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
}

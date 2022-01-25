// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

struct Fraction {
    uint256 n; // numerator
    uint256 d; // denominator
}

struct Fraction112 {
    uint112 n; // numerator
    uint112 d; // denominator
}

struct Uint512 {
    uint256 hi; // 256 most significant bits
    uint256 lo; // 256 least significant bits
}

struct Sint256 {
    uint256 value;
    bool isNeg;
}

/**
 * @dev returns whether a fraction is valid
 */
// solhint-disable-next-line func-visibility
function isFractionValid(Fraction memory fraction) pure returns (bool) {
    return fraction.d != 0;
}

/**
 * @dev returns whether a fraction is positive
 */
// solhint-disable-next-line func-visibility
function isFractionPositive(Fraction memory fraction) pure returns (bool) {
    return isFractionValid(fraction) && fraction.n != 0;
}

/**
 * @dev reduces a standard fraction to a 112-bit fraction
 */
// solhint-disable-next-line func-visibility
function toFraction112(Fraction memory fraction) pure returns (Fraction112 memory) {
    uint256 scale = Math.ceilDiv(Math.max(fraction.n, fraction.d), type(uint112).max);
    return Fraction112({ n: uint112(fraction.n / scale), d: uint112(fraction.d / scale) });
}

/**
 * @dev expands a 112-bit fraction to a standard fraction
 */
// solhint-disable-next-line func-visibility
function fromFraction112(Fraction112 memory fraction112) pure returns (Fraction memory) {
    return Fraction({ n: fraction112.n, d: fraction112.d });
}

/**
 * @dev returns the zero fraction
 */
// solhint-disable-next-line func-visibility
function zeroFraction() pure returns (Fraction memory) {
    return Fraction({ n: 0, d: 1 });
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

/**
 * @dev this contract provides types which can be used by various contracts
 */

struct Fraction {
    uint256 n; // numerator
    uint256 d; // denominator
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
 * @dev returns whether a fraction is zero
 */
// solhint-disable-next-line func-visibility
function isFractionZero(Fraction memory fraction) pure returns (bool) {
    return fraction.n == 0 && isFractionValid(fraction);
}

/**
 * @dev returns the zero fraction
 */
// solhint-disable-next-line func-visibility
function zeroFraction() pure returns (Fraction memory) {
    return Fraction({ n: 0, d: 1 });
}

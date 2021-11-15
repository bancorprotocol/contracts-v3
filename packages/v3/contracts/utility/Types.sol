// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

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

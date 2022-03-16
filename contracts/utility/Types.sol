// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

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

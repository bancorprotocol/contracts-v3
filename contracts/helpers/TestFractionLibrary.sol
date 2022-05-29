// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

// prettier-ignore
import {
    Fraction,
    Fraction112,
    zeroFraction as _zeroFraction,
    zeroFraction112 as _zeroFraction112,
    FractionLibrary
} from "../utility/FractionLibrary.sol";

contract TestFractionLibrary {
    using FractionLibrary for Fraction;
    using FractionLibrary for Fraction112;

    function zeroFraction() external pure returns (Fraction memory) {
        return _zeroFraction();
    }

    function zeroFraction112() external pure returns (Fraction112 memory) {
        return _zeroFraction112();
    }

    function isValid256(Fraction memory fraction) external pure returns (bool) {
        return fraction.isValid();
    }

    function isValid112(Fraction112 memory fraction) external pure returns (bool) {
        return fraction.isValid();
    }

    function isPositive256(Fraction memory fraction) external pure returns (bool) {
        return fraction.isPositive();
    }

    function isPositive112(Fraction112 memory fraction) external pure returns (bool) {
        return fraction.isPositive();
    }

    function inverse256(Fraction memory fraction) external pure returns (Fraction memory) {
        return fraction.inverse();
    }

    function inverse112(Fraction112 memory fraction) external pure returns (Fraction112 memory) {
        return fraction.inverse();
    }

    function toFraction112(Fraction memory fraction) external pure returns (Fraction112 memory) {
        return fraction.toFraction112();
    }

    function fromFraction112(Fraction112 memory fraction) external pure returns (Fraction memory) {
        return fraction.fromFraction112();
    }
}

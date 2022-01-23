// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

// prettier-ignore
import {
    Fraction,
    Fraction112,
    isFractionValid as _isFractionValid,
    isFractionPositive as _isFractionPositive,
    areFractionsEqual as _areFractionsEqual,
    toFraction112 as _toFraction112,
    fromFraction112 as _fromFraction112,
    zeroFraction as _zeroFraction
} from "../utility/Types.sol";

contract TestTypes {
    function isFractionValid(Fraction memory fraction) external pure returns (bool) {
        return _isFractionValid(fraction);
    }

    function isFractionPositive(Fraction memory fraction) external pure returns (bool) {
        return _isFractionPositive(fraction);
    }

    function areFractionsEqual(Fraction memory fraction1, Fraction memory fraction2) external pure returns (bool) {
        return _areFractionsEqual(fraction1, fraction2);
    }

    function toFraction112(Fraction memory fraction) external pure returns (Fraction112 memory) {
        return _toFraction112(fraction);
    }

    function fromFraction112(Fraction112 memory fraction112) external pure returns (Fraction memory) {
        return _fromFraction112(fraction112);
    }

    function zeroFraction() external pure returns (Fraction memory) {
        return _zeroFraction();
    }
}

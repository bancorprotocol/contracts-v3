// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

// prettier-ignore
import {
    Fraction,
    Fraction112,
    zeroFraction as _zeroFraction,
    isFractionValid as _isFractionValid,
    isFractionPositive as _isFractionPositive,
    zeroFraction112 as _zeroFraction112,
    isFraction112Valid as _isFraction112Valid,
    isFraction112Positive as _isFraction112Positive,
    toFraction112 as _toFraction112,
    fromFraction112 as _fromFraction112
} from "../utility/Types.sol";

contract TestTypes {
    function zeroFraction() external pure returns (Fraction memory) {
        return _zeroFraction();
    }

    function isFractionValid(Fraction memory fraction) external pure returns (bool) {
        return _isFractionValid(fraction);
    }

    function isFractionPositive(Fraction memory fraction) external pure returns (bool) {
        return _isFractionPositive(fraction);
    }

    function zeroFraction112() external pure returns (Fraction112 memory) {
        return _zeroFraction112();
    }

    function isFraction112Valid(Fraction112 memory fraction112) external pure returns (bool) {
        return _isFraction112Valid(fraction112);
    }

    function isFraction112Positive(Fraction112 memory fraction112) external pure returns (bool) {
        return _isFraction112Positive(fraction112);
    }

    function toFraction112(Fraction memory fraction) external pure returns (Fraction112 memory) {
        return _toFraction112(fraction);
    }

    function fromFraction112(Fraction112 memory fraction112) external pure returns (Fraction memory) {
        return _fromFraction112(fraction112);
    }
}

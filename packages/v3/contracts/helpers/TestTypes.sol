// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

// prettier-ignore
import {
    Fraction,
    isFractionValid as _isFractionValid,
    isFractionZero as _isFractionZero,
    zeroFraction as _zeroFraction
} from "../utility/Types.sol";

contract TestTypes {
    function isFractionValid(Fraction memory fraction) external pure returns (bool) {
        return _isFractionValid(fraction);
    }

    function isFractionZero(Fraction memory fraction) external pure returns (bool) {
        return _isFractionZero(fraction);
    }

    function zeroFraction() external pure returns (Fraction memory) {
        return _zeroFraction();
    }
}

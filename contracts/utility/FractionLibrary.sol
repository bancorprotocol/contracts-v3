// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Fraction, Fraction112 } from "./Fraction.sol";
import { MathEx } from "./MathEx.sol";

// solhint-disable-next-line func-visibility
function zeroFraction() pure returns (Fraction memory) {
    return Fraction({ n: 0, d: 1 });
}

// solhint-disable-next-line func-visibility
function zeroFraction112() pure returns (Fraction112 memory) {
    return Fraction112({ n: 0, d: 1 });
}

/**
 * @dev this library provides a set of fraction operations
 */
library FractionLibrary {
    /**
     * @dev returns whether a standard fraction is valid
     */
    function isValid(Fraction memory fraction) internal pure returns (bool) {
        return fraction.d != 0;
    }

    /**
     * @dev returns whether a standard fraction is positive
     */
    function isPositive(Fraction memory fraction) internal pure returns (bool) {
        return isValid(fraction) && fraction.n != 0;
    }

    /**
     * @dev returns whether a 112-bit fraction is valid
     */
    function isValid(Fraction112 memory fraction) internal pure returns (bool) {
        return fraction.d != 0;
    }

    /**
     * @dev returns whether a 112-bit fraction is positive
     */
    function isPositive(Fraction112 memory fraction) internal pure returns (bool) {
        return isValid(fraction) && fraction.n != 0;
    }

    /**
     * @dev reduces a standard fraction to a 112-bit fraction
     */
    function toFraction112(Fraction memory fraction) internal pure returns (Fraction112 memory) {
        Fraction memory reducedFraction = MathEx.reducedFraction(fraction, type(uint112).max);
        return Fraction112({ n: uint112(reducedFraction.n), d: uint112(reducedFraction.d) });
    }

    /**
     * @dev expands a 112-bit fraction to a standard fraction
     */
    function fromFraction112(Fraction112 memory fraction) internal pure returns (Fraction memory) {
        return Fraction({ n: fraction.n, d: fraction.d });
    }
}

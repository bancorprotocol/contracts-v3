// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Fraction, Fraction112, InvalidFraction } from "./Fraction.sol";
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
     * @dev returns whether a 112-bit fraction is valid
     */
    function isValid(Fraction112 memory fraction) internal pure returns (bool) {
        return fraction.d != 0;
    }

    /**
     * @dev returns whether a standard fraction is positive
     */
    function isPositive(Fraction memory fraction) internal pure returns (bool) {
        return isValid(fraction) && fraction.n != 0;
    }

    /**
     * @dev returns whether a 112-bit fraction is positive
     */
    function isPositive(Fraction112 memory fraction) internal pure returns (bool) {
        return isValid(fraction) && fraction.n != 0;
    }

    /**
     * @dev returns the inverse of a given fraction
     */
    function inverse(Fraction memory fraction) internal pure returns (Fraction memory) {
        Fraction memory invFraction = Fraction({ n: fraction.d, d: fraction.n });

        if (!isValid(invFraction)) {
            revert InvalidFraction();
        }

        return invFraction;
    }

    /**
     * @dev returns the inverse of a given fraction
     */
    function inverse(Fraction112 memory fraction) internal pure returns (Fraction112 memory) {
        Fraction112 memory invFraction = Fraction112({ n: fraction.d, d: fraction.n });

        if (!isValid(invFraction)) {
            revert InvalidFraction();
        }

        return invFraction;
    }

    /**
     * @dev reduces a standard fraction to a 112-bit fraction
     */
    function toFraction112(Fraction memory fraction) internal pure returns (Fraction112 memory) {
        Fraction memory truncatedFraction = MathEx.truncatedFraction(fraction, type(uint112).max);

        return Fraction112({ n: uint112(truncatedFraction.n), d: uint112(truncatedFraction.d) });
    }

    /**
     * @dev expands a 112-bit fraction to a standard fraction
     */
    function fromFraction112(Fraction112 memory fraction) internal pure returns (Fraction memory) {
        return Fraction({ n: fraction.n, d: fraction.d });
    }
}

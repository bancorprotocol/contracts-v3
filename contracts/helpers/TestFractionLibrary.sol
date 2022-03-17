// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { Fraction, Fraction112 } from "../utility/Types.sol";
import { FractionLibrary } from "../utility/FractionLibrary.sol";

contract TestFractionLibrary {
    using FractionLibrary for Fraction;
    using FractionLibrary for Fraction112;

    function isValid256(Fraction memory fraction) external pure returns (bool) {
        return fraction.isValid();
    }

    function isPositive256(Fraction memory fraction) external pure returns (bool) {
        return fraction.isPositive();
    }

    function isValid112(Fraction112 memory fraction) external pure returns (bool) {
        return fraction.isValid();
    }

    function isPositive112(Fraction112 memory fraction) external pure returns (bool) {
        return fraction.isPositive();
    }

    function toFraction112(Fraction memory fraction) external pure returns (Fraction112 memory) {
        return fraction.toFraction112();
    }

    function fromFraction112(Fraction112 memory fraction) external pure returns (Fraction memory) {
        return fraction.fromFraction112();
    }
}

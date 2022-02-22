// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { Fraction, Fraction112 } from "../utility/Types.sol";
import { FractionLibrary } from "../utility/FractionLibrary.sol";

contract TestFractionLibrary {
    using FractionLibrary for Fraction;
    using FractionLibrary for Fraction112;

    function isFractionValid(Fraction memory fraction) external pure returns (bool) {
        return fraction.isFractionValid();
    }

    function isFractionPositive(Fraction memory fraction) external pure returns (bool) {
        return fraction.isFractionPositive();
    }

    function isFraction112Valid(Fraction112 memory fraction112) external pure returns (bool) {
        return fraction112.isFraction112Valid();
    }

    function isFraction112Positive(Fraction112 memory fraction112) external pure returns (bool) {
        return fraction112.isFraction112Positive();
    }

    function toFraction112(Fraction memory fraction) external pure returns (Fraction112 memory) {
        return fraction.toFraction112();
    }

    function fromFraction112(Fraction112 memory fraction112) external pure returns (Fraction memory) {
        return fraction112.fromFraction112();
    }
}

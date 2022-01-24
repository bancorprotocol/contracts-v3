// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { Fraction, Fraction112 } from "../utility/Types.sol";
import { PoolAverageRate } from "../pools/PoolAverageRate.sol";

contract TestPoolAverageRate {
    function calcAverageRate(
        Fraction112 calldata averageRate,
        Fraction calldata spotRate,
        uint16 weightPPT
    ) external pure returns (Fraction112 memory) {
        return PoolAverageRate.calcAverageRate(averageRate, spotRate, weightPPT);
    }

    function isSpotRateStable(
        Fraction112 calldata averageRate,
        Fraction calldata spotRate,
        uint32 maxDeviationPPM
    ) external pure returns (bool) {
        return PoolAverageRate.isSpotRateStable(averageRate, spotRate, maxDeviationPPM);
    }

    function isValid(Fraction112 memory averageRate) external pure returns (bool) {
        return PoolAverageRate.isValid(averageRate);
    }

    function areEqual(Fraction112 calldata averageRate1, Fraction112 calldata averageRate2)
        external
        pure
        returns (bool)
    {
        return PoolAverageRate.areEqual(averageRate1, averageRate2);
    }
}

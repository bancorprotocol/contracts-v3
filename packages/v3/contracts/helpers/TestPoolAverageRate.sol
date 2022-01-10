// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { Fraction, Fraction112 } from "../utility/Types.sol";
import { PoolAverageRate, AverageRate } from "../pools/PoolAverageRate.sol";

contract TestPoolAverageRate {
    function calcAverageRate(
        Fraction calldata spotRate,
        AverageRate calldata averageRate,
        uint32 currentTime
    ) external pure returns (AverageRate memory) {
        return PoolAverageRate.calcAverageRate(spotRate, averageRate, currentTime);
    }

    function isPoolRateStable(
        Fraction calldata spotRate,
        AverageRate calldata averageRate,
        uint32 maxDeviation
    ) external pure returns (bool) {
        return PoolAverageRate.isPoolRateStable(spotRate, averageRate, maxDeviation);
    }

    function reducedRatio(Fraction memory ratio) external pure returns (Fraction112 memory) {
        return PoolAverageRate.reducedRatio(ratio);
    }

    function isEqual(AverageRate memory averageRate1, AverageRate memory averageRate2) external pure returns (bool) {
        return PoolAverageRate.isEqual(averageRate1, averageRate2);
    }
}

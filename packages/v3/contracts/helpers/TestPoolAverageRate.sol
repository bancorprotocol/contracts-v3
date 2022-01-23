// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { Fraction } from "../utility/Types.sol";
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
        uint32 maxDeviation,
        uint32 currentTime
    ) external pure returns (bool) {
        return PoolAverageRate.isPoolRateStable(spotRate, averageRate, maxDeviation, currentTime);
    }

    function reducedRatio(Fraction memory ratio) external pure returns (Fraction memory) {
        return PoolAverageRate.reducedRatio(ratio);
    }

    function isValid(AverageRate memory averageRate) external pure returns (bool) {
        return PoolAverageRate.isValid(averageRate);
    }

    function isEqual(AverageRate memory averageRate1, AverageRate memory averageRate2) external pure returns (bool) {
        return PoolAverageRate.isEqual(averageRate1, averageRate2);
    }
}

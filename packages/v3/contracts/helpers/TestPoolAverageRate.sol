// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { Fraction } from "../utility/Types.sol";
import { PoolAverageRate, AverageRate } from "../pools/PoolAverageRate.sol";

contract TestPoolAverageRate {
    function calcAverageRate(
        AverageRate calldata averageRate,
        Fraction calldata spotRate,
        uint32 currentTime,
        uint16 weightPPT
    ) external pure returns (AverageRate memory) {
        return PoolAverageRate.calcAverageRate(averageRate, spotRate, currentTime, weightPPT);
    }

    function isSpotRateStable(
        AverageRate calldata averageRate,
        Fraction calldata spotRate,
        uint32 maxDeviation,
        uint32 currentTime,
        uint16 weightPPT
    ) external pure returns (bool) {
        return PoolAverageRate.isSpotRateStable(averageRate, spotRate, maxDeviation, currentTime, weightPPT);
    }

    function isValid(AverageRate memory averageRate) external pure returns (bool) {
        return PoolAverageRate.isValid(averageRate);
    }

    function areEqual(AverageRate calldata averageRate1, AverageRate calldata averageRate2)
        external
        pure
        returns (bool)
    {
        return PoolAverageRate.areEqual(averageRate1, averageRate2);
    }
}

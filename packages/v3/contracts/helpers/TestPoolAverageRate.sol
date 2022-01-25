// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { Fraction } from "../utility/Types.sol";
import { PoolAverageRate } from "../pools/PoolAverageRate.sol";

contract TestPoolAverageRate {
    function calcAverageRate(
        Fraction calldata averageRate,
        Fraction calldata spotRate,
        uint16 weightPPT
    ) external pure returns (Fraction memory) {
        return PoolAverageRate.calcAverageRate(averageRate, spotRate, weightPPT);
    }

    function isSpotRateStable(
        Fraction calldata spotRate,
        Fraction calldata averageRate,
        uint32 maxDeviationPPM
    ) external pure returns (bool) {
        return PoolAverageRate.isSpotRateStable(spotRate, averageRate, maxDeviationPPM);
    }
}

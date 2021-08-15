// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

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

    function verifyAverageRate(
        Fraction calldata spotRate,
        AverageRate calldata averageRate,
        uint256 maxDeviation
    ) external pure {
        return PoolAverageRate.verifyAverageRate(spotRate, averageRate, maxDeviation);
    }
}

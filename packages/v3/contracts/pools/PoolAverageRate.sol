// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { MathEx } from "../utility/MathEx.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Fraction } from "../utility/Types.sol";

struct AverageRate {
    uint32 time; // the time when the rate was recorded (Unix timestamp))
    Fraction rate; // the rate
}

/**
 * @dev Pool average-rate calculation helper library
 */
library PoolAverageRate {
    // the average rate (TWA) window length
    uint256 private constant AVERAGE_RATE_PERIOD = 10 minutes;

    /**
     * @dev records and returns an updated average rate
     *
     * the average rate is updated according to the following formula:
     *
     * t = the elapsed time since the previous average rate was calculated
     * T = the average rate (TWA) window length
     * P = the previous/current average rate
     * S = the current spot price
     *
     *      if t == 0, return P
     *      if t >= T, return S
     *      else, return:             T - t         t
     *                           P * ------- + S * ---
     *                                  T           T
     */
    function calcAverageRate(
        Fraction memory spotRate,
        AverageRate memory averageRate,
        uint32 currentTime
    ) internal pure returns (AverageRate memory) {
        // get the elapsed time since the previous average rate was calculated
        uint256 timeElapsed;
        unchecked {
            timeElapsed = currentTime - averageRate.time;
        }

        // if the previous average rate was calculated in the current block, the average rate remains unchanged
        if (timeElapsed == 0) {
            return averageRate;
        }

        // if the previous average rate was calculated a while ago (or never), the average rate should be equal to the
        // spot rate
        if (timeElapsed >= AVERAGE_RATE_PERIOD || averageRate.time == 0) {
            return AverageRate({ time: currentTime, rate: MathEx.reducedRatio(spotRate, type(uint112).max) });
        }

        // calculate the new average rate
        uint256 x = averageRate.rate.d * spotRate.n;
        uint256 y = averageRate.rate.n * spotRate.d;

        // since we know that timeElapsed < AVERAGE_RATE_PERIOD, we can avoid checked operations
        uint256 remainingWindow;
        unchecked {
            remainingWindow = AVERAGE_RATE_PERIOD - timeElapsed;
        }
        Fraction memory newRate = Fraction({
            n: (y * remainingWindow) + x * timeElapsed,
            d: averageRate.rate.d * spotRate.d * AVERAGE_RATE_PERIOD
        });

        newRate = MathEx.reducedRatio(newRate, type(uint112).max);

        return AverageRate({ time: currentTime, rate: newRate });
    }

    /**
     * @dev returns whether the spot rate is stable (i.e., the deviation of the average rate from the
     * spot rate is within the permitted range)
     *
     * for example, if the maximum permitted deviation is 5%, then verify `95% <= average/spot <= 105%`
     *
     * requirements:
     *
     * - spotRate numerator/denumerator should be bound by 128 bits (otherwise, the check might revert with an overflow)
     * - maxDeviation must be lesser or equal to PPM_RESOLUTION
     */
    function isPoolRateStable(
        Fraction memory spotRate,
        AverageRate memory averageRate,
        uint32 maxDeviation
    ) internal pure returns (bool) {
        uint256 lowerBound;
        uint256 upperBound;
        unchecked {
            lowerBound = PPM_RESOLUTION - maxDeviation;
            upperBound = PPM_RESOLUTION + maxDeviation;
        }
        uint256 d = averageRate.rate.d * spotRate.n;
        uint256 min = MathEx.mulDivC(d, lowerBound, PPM_RESOLUTION);
        uint256 mid = averageRate.rate.n * spotRate.d;
        uint256 max = MathEx.mulDivF(d, upperBound, PPM_RESOLUTION);

        return min <= mid && mid <= max;
    }

    /**
     * @dev compares two average rates
     */
    function isEqual(AverageRate memory averageRate1, AverageRate memory averageRate2) internal pure returns (bool) {
        return averageRate1.rate.n * averageRate2.rate.d == averageRate2.rate.n * averageRate1.rate.d;
    }
}

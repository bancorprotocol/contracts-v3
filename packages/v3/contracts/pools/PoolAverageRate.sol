// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { MathEx } from "../utility/MathEx.sol";
import { PPT_RESOLUTION, PPM_RESOLUTION } from "../utility/Constants.sol";
import { Fraction, Fraction112, Uint512, isFractionValid, areFractionsEqual, toFraction112, fromFraction112 } from "../utility/Types.sol";

struct AverageRate {
    uint32 time;
    Fraction112 rate;
}

/**
 * @dev Pool average-rate helper library
 */
library PoolAverageRate {
    /**
     * @dev returns a new average rate
     *
     * with theoretical input:
     * - `a` denoting the current average rate
     * - `s` denoting the current spot rate
     * - `w` denoting the average rate weight
     *
     * the new average rate is theoreticalally calculated as `a * w + s * (1 - w)`
     *
     * with practical input:
     * - `an / ad` denoting the current average rate
     * - `sn / sd` denoting the current spot rate
     * - `w / T` denoting the average rate weight, where `T` denotes `PPT_RESOLUTION`
     *
     * the new average rate is practically calculated as:
     *
     * an   w   sn   T - w   an * sd * w + ad * sn * (T - w)
     * -- * - + -- * ----- = -------------------------------
     * ad   T   sd     T               ad * sd * T
     *
     * requirements:
     *
     * - weightPPT must be lesser or equal to PPT_RESOLUTION
     */
    function calcAverageRate(
        AverageRate memory averageRate,
        Fraction memory spotRate,
        uint32 currentTime,
        uint16 weightPPT
    ) internal pure returns (AverageRate memory) {
        // refrain from recalculating the average rate if it has already been calculated in the current block
        if (averageRate.time == currentTime) {
            return averageRate;
        }

        // calculate a new average rate
        Fraction memory currRate = fromFraction112(averageRate.rate);
        Fraction112 memory newRate = toFraction112(
            Fraction({
                n: currRate.n * spotRate.d * weightPPT + currRate.d * spotRate.n * (PPT_RESOLUTION - weightPPT),
                d: currRate.d * spotRate.d * PPT_RESOLUTION
            })
        );

        // return the new average rate
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
     * - maxDeviationPPM must be lesser or equal to PPM_RESOLUTION
     * - weightPPT must be lesser or equal to PPT_RESOLUTION
     */
    function isSpotRateStable(
        AverageRate memory averageRate,
        Fraction memory spotRate,
        uint32 maxDeviationPPM,
        uint32 currentTime,
        uint16 weightPPT
    ) internal pure returns (bool) {
        averageRate = calcAverageRate(averageRate, spotRate, currentTime, weightPPT);
        Fraction memory currRate = fromFraction112(averageRate.rate);

        uint256 x = currRate.d * spotRate.n;
        uint256 y = currRate.n * spotRate.d;

        Uint512 memory min = MathEx.mul512(x, PPM_RESOLUTION - maxDeviationPPM);
        Uint512 memory mid = MathEx.mul512(y, PPM_RESOLUTION);
        Uint512 memory max = MathEx.mul512(x, PPM_RESOLUTION + maxDeviationPPM);

        return MathEx.lte512(min, mid) && MathEx.lte512(mid, max);
    }

    /**
     * @dev returns whether an average rate is valid
     */
    function isValid(AverageRate memory averageRate) internal pure returns (bool) {
        return averageRate.time != 0 && isFractionValid(fromFraction112(averageRate.rate));
    }

    /**
     * @dev returns whether two average rates are equal
     */
    function areEqual(AverageRate memory averageRate1, AverageRate memory averageRate2) internal pure returns (bool) {
        return
            averageRate1.time == averageRate2.time &&
            areFractionsEqual(fromFraction112(averageRate1.rate), fromFraction112(averageRate2.rate));
    }
}

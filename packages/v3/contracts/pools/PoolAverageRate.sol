// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { MathEx } from "../utility/MathEx.sol";
import { PPT_RESOLUTION, PPM_RESOLUTION } from "../utility/Constants.sol";
import { Fraction, Fraction112, Uint512, isFractionValid, areFractionsEqual, toFraction112, fromFraction112 } from "../utility/Types.sol";

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
        Fraction112 memory averageRate,
        Fraction memory spotRate,
        uint16 weightPPT
    ) internal pure returns (Fraction112 memory) {
        Fraction memory currRate = fromFraction112(averageRate);

        Fraction memory newRate = Fraction({
            n: currRate.n * spotRate.d * weightPPT + currRate.d * spotRate.n * (PPT_RESOLUTION - weightPPT),
            d: currRate.d * spotRate.d * PPT_RESOLUTION
        });

        return toFraction112(newRate);
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
     */
    function isSpotRateStable(
        Fraction memory spotRate,
        Fraction112 memory averageRate,
        uint32 maxDeviationPPM
    ) internal pure returns (bool) {
        uint256 x = spotRate.n * averageRate.d;
        uint256 y = spotRate.d * averageRate.n;

        Uint512 memory min = MathEx.mul512(x, PPM_RESOLUTION - maxDeviationPPM);
        Uint512 memory mid = MathEx.mul512(y, PPM_RESOLUTION);
        Uint512 memory max = MathEx.mul512(x, PPM_RESOLUTION + maxDeviationPPM);

        return MathEx.lte512(min, mid) && MathEx.lte512(mid, max);
    }

    /**
     * @dev returns whether an average rate is valid
     */
    function isValid(Fraction112 memory averageRate) internal pure returns (bool) {
        return isFractionValid(fromFraction112(averageRate));
    }

    /**
     * @dev returns whether two average rates are equal
     */
    function areEqual(Fraction112 memory averageRate1, Fraction112 memory averageRate2) internal pure returns (bool) {
        return areFractionsEqual(fromFraction112(averageRate1), fromFraction112(averageRate2));
    }
}

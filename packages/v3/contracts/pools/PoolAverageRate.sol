// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";

import { MathEx } from "../utility/MathEx.sol";
import { MAX_UINT112, PPM_RESOLUTION } from "../utility/Constants.sol";
import { Fraction } from "../utility/Types.sol";

struct AverageRate {
    // the time when the rate was recorded (Unix timestamp))
    uint32 time;
    // the rate
    Fraction rate;
}

/**
 * @dev Pool average-rate calculation helper library
 */
library PoolAverageRate {
    using SafeMath for uint256;

    // the average rate (SMA) window length
    uint256 private constant AVERAGE_RATE_PERIOD = 10 minutes;

    /**
     * @dev records and returns an updated average rate
     */
    function calcAverageRate(
        Fraction memory spotRate,
        AverageRate memory averageRate,
        uint32 currentTime
    ) internal pure returns (AverageRate memory) {
        // get the elapsed time since the previous average rate was calculated
        uint256 timeElapsed = currentTime - averageRate.time;

        // if the previous average rate was calculated in the current block, the average rate remains unchanged
        if (timeElapsed == 0) {
            return averageRate;
        }

        // if the previous average rate was calculated a while ago (or never), the average rate should be equal to the
        // spot rate
        if (timeElapsed >= AVERAGE_RATE_PERIOD || averageRate.time == 0) {
            return AverageRate({ time: currentTime, rate: MathEx.reducedRatio(spotRate, MAX_UINT112) });
        }

        // calculate the new average rate
        uint256 x = averageRate.rate.d.mul(spotRate.n);
        uint256 y = averageRate.rate.n.mul(spotRate.d);

        // since we know that timeElapsed < AVERAGE_RATE_PERIOD, we can avoid using SafeMath:
        Fraction memory newRate = Fraction({
            n: y.mul(AVERAGE_RATE_PERIOD - timeElapsed).add(x.mul(timeElapsed)),
            d: averageRate.rate.d.mul(spotRate.d).mul(AVERAGE_RATE_PERIOD)
        });

        newRate = MathEx.reducedRatio(newRate, MAX_UINT112);

        return AverageRate({ time: currentTime, rate: newRate });
    }

    /**
     * @dev verifies that the deviation of the average rate from the spot rate is within the permitted range
     *
     * for example, if the maximum permitted deviation is 5%, then verify `95/100 <= average/spot <= 100/95`
     */
    function verifyAverageRate(
        Fraction memory spotRate,
        AverageRate memory averageRate,
        uint256 maxDeviation
    ) internal pure {
        uint256 ppmDelta = PPM_RESOLUTION - maxDeviation;
        uint256 min = spotRate.n.mul(averageRate.rate.d).mul(ppmDelta).mul(ppmDelta);
        uint256 mid = spotRate.d.mul(averageRate.rate.n).mul(ppmDelta).mul(PPM_RESOLUTION);
        uint256 max = spotRate.n.mul(averageRate.rate.d).mul(PPM_RESOLUTION).mul(PPM_RESOLUTION);

        require(min <= mid && mid <= max, "ERR_INVALID_RATE");
    }
}

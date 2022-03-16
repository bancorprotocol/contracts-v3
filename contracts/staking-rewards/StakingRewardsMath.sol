// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import { Fraction } from "../utility/Types.sol";
import { MathEx } from "../utility/MathEx.sol";

/**
 * @dev This library supports the calculation of staking rewards
 */
library StakingRewardsMath {
    uint256 private constant LAMBDA_N = 142857142857143;
    uint256 private constant LAMBDA_D = 10000000000000000000000;

    /**
     * @dev returns the amount of rewards distributed on a flat amount ratio
     */
    function calcFlatRewards(
        uint256 totalRewards,
        uint32 timeElapsed,
        uint32 programDuration
    ) internal pure returns (uint256) {
        assert(timeElapsed <= programDuration);
        return MathEx.mulDivF(totalRewards, timeElapsed, programDuration);
    }

    /**
     * @dev returns the amount of rewards distributed after a given time period since deployment has elapsed
     * The returned value is calculated as `totalRewards * (1 - 1 / e ^ (timeElapsed * LAMBDA))`.
     * Note that because the exponentiation function is limited to an input of up to (and excluding) 16, the
     * input value to this function is limited by `timeElapsed * LAMBDA < 16` --> `timeElapsed < 1120000000`.
     * For `timeElapsed = 1120000000 - 1`, the formula above returns more than 99.9999% of `totalRewards`.
     */
    function calcExpDecayRewards(uint256 totalRewards, uint32 timeElapsed) internal pure returns (uint256) {
        Fraction memory input = Fraction({ n: timeElapsed * LAMBDA_N, d: LAMBDA_D });
        Fraction memory output = MathEx.exp(input);
        return MathEx.mulDivF(totalRewards, output.n - output.d, output.n);
    }
}

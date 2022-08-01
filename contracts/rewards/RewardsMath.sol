// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Fraction } from "../utility/FractionLibrary.sol";
import { MathEx } from "../utility/MathEx.sol";

/**
 * @dev This library supports the calculation of staking rewards
 */
library RewardsMath {
    /**
     * @dev returns the amount of rewards distributed on a flat amount ratio
     */
    function calcFlatRewards(
        uint256 totalRewards,
        uint32 timeElapsed,
        uint32 programDuration
    ) internal pure returns (uint256) {
        // ensures that the function never returns more than the total rewards
        assert(timeElapsed <= programDuration);
        return MathEx.mulDivF(totalRewards, timeElapsed, programDuration);
    }

    /**
     * @dev returns the amount of rewards distributed after a given time period since deployment has elapsed
     *
     * the returned value is calculated as `totalRewards * (1 - 1 / 2 ^ (timeElapsed / halfLife))`
     * note that because the exponentiation function is limited to an input of up to (and excluding)
     * 16 / ln 2, the input value to this function is limited by `timeElapsed / halfLife < 16 / ln 2`
     */
    function calcExpDecayRewards(
        uint256 totalRewards,
        uint32 timeElapsed,
        uint32 halfLife
    ) internal pure returns (uint256) {
        Fraction memory input = Fraction({ n: timeElapsed, d: halfLife });
        Fraction memory output = MathEx.exp2(input);
        return MathEx.mulDivF(totalRewards, output.n - output.d, output.n);
    }
}

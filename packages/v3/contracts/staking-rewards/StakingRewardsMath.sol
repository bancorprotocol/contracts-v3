// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import { Fraction } from "../utility/Types.sol";
import { MathEx } from "../utility/MathEx.sol";

/**
 * @dev This contract contains the functions necessary to process staking rewards
 */
contract StakingRewardsMath {
    uint256 private constant LAMBDA_N = 142857142857143;
    uint256 private constant LAMBDA_D = 10000000000000000000000;

    /**
     * @dev returns the amount of rewards distributed on a flat amount ratio
     */
    function _calculateFlatRewards(
        uint32 timeElapsedSinceLastDistribution,
        uint32 remainingProgramDuration,
        uint256 remainingRewards
    ) internal pure returns (uint256) {
        return (remainingRewards * timeElapsedSinceLastDistribution) / remainingProgramDuration;
    }

    /**
     * @dev returns the amount of rewards distributed after a given time period since deployment has elapsed
     * The returned value is calculated as `totalRewards * (1 - 1 / e ^ (LAMBDA * timeElapsed))`.
     * Note that because the exponentiation function is limited to an input of up to (and excluding) 16, the
     * input value to this function is limited by `LAMBDA * timeElapsed < 16` --> `timeElapsed < 1120000000`.
     * For `timeElapsed = 1120000000 - 1`, the formula above returns more than 99.9999% of `totalRewards`.
     */
    function _calculateExponentialDecayRewardsAfterTimeElapsed(uint32 timeElapsed, uint256 totalRewards)
        internal
        pure
        returns (uint256)
    {
        Fraction memory input = Fraction({ n: timeElapsed * LAMBDA_N, d: LAMBDA_D });
        Fraction memory output = MathEx.exp(input);
        return MathEx.mulDivF(totalRewards, output.n - output.d, output.n);
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { StakingRewardsMath } from "../staking-rewards/StakingRewardsMath.sol";

contract TestStakingRewardsMath is StakingRewardsMath {
    function calculatePoolTokenToBurnT(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d
    ) external pure returns (uint256) {
        return _calculatePoolTokenToBurn(a, b, c, d);
    }

    function calculateFlatRewards(
        uint256 timeElapsed,
        uint256 remainingProgramTime,
        uint256 availableRewards
    ) external pure returns (uint256) {
        return _calculateFlatRewards(timeElapsed, remainingProgramTime, availableRewards);
    }

    function calculateExponentialDecayRewardsAfterTimeElapsed(uint256 timeElapsed, uint256 totalRewards)
        external
        pure
        returns (uint256)
    {
        return _calculateExponentialDecayRewardsAfterTimeElapsed(timeElapsed, totalRewards);
    }

    function expT(uint256 a, uint256 b) external pure returns (uint256, uint256) {
        return (exp(a, b), ONE);
    }
}

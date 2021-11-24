// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { StakingRewardsMath } from "../stakingRewards/StakingRewardsMath.sol";

contract TestStakingRewards is StakingRewardsMath {
    function rewardT(uint256 numOfSeconds, uint256 totalRewards) external pure returns (uint256) {
        return processExponentialDecayReward(numOfSeconds, totalRewards);
    }

    function expT(uint256 a, uint256 b) external pure returns (uint256, uint256) {
        return (exp(a, b), ONE);
    }
}

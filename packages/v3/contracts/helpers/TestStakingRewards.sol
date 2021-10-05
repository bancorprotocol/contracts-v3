// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { StakingRewards } from "../staking-rewards/StakingRewards.sol";

contract TestStakingRewards is StakingRewards {
    function rewardT(uint256 numOfSeconds) external pure returns (uint256) {
        return reward(numOfSeconds);
    }

    function expT(uint256 a, uint256 b) external pure returns (uint256, uint256) {
        return (exp(a, b), ONE);
    }
}

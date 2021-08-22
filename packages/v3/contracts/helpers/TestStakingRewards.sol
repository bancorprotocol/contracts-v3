// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { StakingRewards } from "../staking-rewards/StakingRewards.sol";

contract TestStakingRewards is StakingRewards {
    function rewardT(uint256 remainingRewards, uint256 numOfBlocksElapsed) external pure returns (uint256) {
        return reward(remainingRewards, numOfBlocksElapsed);
    }

    function expT(uint256 a, uint256 b) external pure returns (uint256, uint256) {
        return (exp(a, b), ONE);
    }
}

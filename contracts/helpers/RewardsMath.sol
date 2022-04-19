// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { RewardsMath } from "../rewards/RewardsMath.sol";

contract TestRewardsMath {
    function calcFlatRewards(
        uint256 totalRewards,
        uint32 timeElapsed,
        uint32 programDuration
    ) external pure returns (uint256) {
        return RewardsMath.calcFlatRewards(totalRewards, timeElapsed, programDuration);
    }

    function calcExpDecayRewards(
        uint256 totalRewards,
        uint32 timeElapsed,
        uint32 halfLife
    ) external pure returns (uint256) {
        return RewardsMath.calcExpDecayRewards(totalRewards, timeElapsed, halfLife);
    }
}

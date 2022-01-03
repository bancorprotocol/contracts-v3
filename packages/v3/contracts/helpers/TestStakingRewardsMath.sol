// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { StakingRewardsMath } from "../staking-rewards/StakingRewardsMath.sol";

contract TestStakingRewardsMath {
    function calcFlatRewards(
        uint256 totalRewards,
        uint32 timeElapsed,
        uint32 programDuration
    ) external pure returns (uint256) {
        return StakingRewardsMath.calcFlatRewards(totalRewards, timeElapsed, programDuration);
    }

    function calcExpDecayRewards(uint256 totalRewards, uint32 timeElapsed) external pure returns (uint256) {
        return StakingRewardsMath.calcExpDecayRewards(totalRewards, timeElapsed);
    }

    function calcPoolTokenAmountToBurn(
        uint256 poolTokenSupply,
        uint256 poolTokenBalance,
        uint256 tokenStakedBalance,
        uint256 tokenAmountToDistribute
    ) external pure returns (uint256) {
        return
            StakingRewardsMath.calcPoolTokenAmountToBurn(
                poolTokenSupply,
                poolTokenBalance,
                tokenStakedBalance,
                tokenAmountToDistribute
            );
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { StakingRewardsMath } from "../staking-rewards/StakingRewardsMath.sol";

contract TestStakingRewardsMath is StakingRewardsMath {
    function calculatePoolTokenToBurnT(
        uint256 totalAmountOfTokenStaked,
        uint256 amountOfTokenToDistribute,
        uint256 totalSupplyOfPoolToken,
        uint256 amountOfPoolTokenOwnedByProtocol
    ) external pure returns (uint256) {
        return
            _calculatePoolTokenToBurn(
                totalAmountOfTokenStaked,
                amountOfTokenToDistribute,
                totalSupplyOfPoolToken,
                amountOfPoolTokenOwnedByProtocol
            );
    }

    function calculateFlatRewardsT(
        uint32 timeElapsed,
        uint32 remainingProgramTime,
        uint256 availableRewards
    ) external pure returns (uint256) {
        return _calculateFlatRewards(timeElapsed, remainingProgramTime, availableRewards);
    }

    function calculateExponentialDecayRewardsAfterTimeElapsedT(uint32 timeElapsed, uint256 totalRewards)
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

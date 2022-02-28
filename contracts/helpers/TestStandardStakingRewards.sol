// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { Time } from "../utility/Time.sol";

import { StandardStakingRewards } from "../staking-rewards/StandardStakingRewards.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";

import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { Token } from "../token/Token.sol";

import { IExternalRewardsVault } from "../vaults/interfaces/IExternalRewardsVault.sol";

import { TestTime } from "./TestTime.sol";

contract TestStandardStakingRewards is StandardStakingRewards, TestTime {
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        ITokenGovernance initBNTGovernance,
        IBNTPool initBNTPool,
        IExternalRewardsVault initExternalRewardsVault
    )
        StandardStakingRewards(
            initNetwork,
            initNetworkSettings,
            initBNTGovernance,
            initBNTPool,
            initExternalRewardsVault
        )
    {}

    function nextProgramId() external view returns (uint256) {
        return _nextProgramId;
    }

    function activeProgramIdByPool(Token pool) external view returns (uint256) {
        return _activeProgramIdByPool[pool];
    }

    function unclaimedRewards(Token rewardsToken) external view returns (uint256) {
        return _unclaimedRewards[rewardsToken];
    }

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}

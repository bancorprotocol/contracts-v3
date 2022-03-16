// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { Time } from "../utility/Time.sol";

import { ProgramData } from "../staking-rewards/interfaces/IStandardStakingRewards.sol";
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

    function unclaimedRewards(Token rewardsToken) external view returns (uint256) {
        return _unclaimedRewards[rewardsToken];
    }

    function programRewards(uint256 id) external view returns (Rewards memory) {
        return _programRewards[id];
    }

    function providerRewards(address provider, uint256 id) external view returns (ProviderRewards memory) {
        return _providerRewards[provider][id];
    }

    function claimRewardsWithAmounts(uint256[] calldata ids, uint256 maxAmount) external returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](ids.length);

        for (uint256 i = 0; i < ids.length && maxAmount > 0; i++) {
            uint256 id = ids[i];

            ProgramData memory p = _programs[id];

            ClaimData memory claimData = _claimRewards(msg.sender, p, maxAmount);

            amounts[i] = claimData.amount;

            if (maxAmount != type(uint256).max) {
                maxAmount -= claimData.amount;
            }
        }

        return amounts;
    }

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}

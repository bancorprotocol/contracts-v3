// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Time } from "../utility/Time.sol";

import { AutoCompoundingRewards } from "../rewards/AutoCompoundingRewards.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";

import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { IExternalRewardsVault } from "../vaults/interfaces/IExternalRewardsVault.sol";

import { TestTime } from "./TestTime.sol";

contract TestAutoCompoundingRewards is AutoCompoundingRewards, TestTime {
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initBNT,
        IBNTPool initBNTPool,
        IExternalRewardsVault initExternalRewardsVault
    ) AutoCompoundingRewards(initNetwork, initNetworkSettings, initBNT, initBNTPool, initExternalRewardsVault) {}

    function autoProcessRewardsIndex() external view returns (uint256) {
        return _autoProcessRewardsIndex;
    }

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Time } from "../utility/Time.sol";

import { AutoCompoundingStakingRewards } from "../staking-rewards/AutoCompoundingStakingRewards.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";

import { TestTime } from "./TestTime.sol";

contract TestAutoCompoundingStakingRewards is AutoCompoundingStakingRewards, TestTime {
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initNetworkToken,
        IMasterPool initMasterPool
    ) AutoCompoundingStakingRewards(initNetwork, initNetworkSettings, initNetworkToken, initMasterPool) {}

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}

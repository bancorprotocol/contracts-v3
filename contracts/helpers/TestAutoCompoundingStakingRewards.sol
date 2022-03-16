// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Time } from "../utility/Time.sol";

import { AutoCompoundingStakingRewards } from "../staking-rewards/AutoCompoundingStakingRewards.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { TestTime } from "./TestTime.sol";

contract TestAutoCompoundingStakingRewards is AutoCompoundingStakingRewards, TestTime {
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initBNT,
        IBNTPool initBNTPool
    ) AutoCompoundingStakingRewards(initNetwork, initNetworkSettings, initBNT, initBNTPool) {}

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}

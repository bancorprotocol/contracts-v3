// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { AutoCompoundingStakingRewards, ProgramData } from "../stakingRewards/AutoCompoundingStakingRewards.sol";
import { TestTime } from "./TestTime.sol";
import { Time } from "../utility/Time.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";

contract TestAutoCompoundingStakingRewards is AutoCompoundingStakingRewards, TestTime {
    constructor(IBancorNetwork initNetwork, IMasterPool initNetworkTokenPool)
        AutoCompoundingStakingRewards(initNetwork, initNetworkTokenPool)
    {}

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}

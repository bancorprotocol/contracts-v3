// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { AutoCompoundingStakingRewards } from "../staking-rewards/AutoCompoundingStakingRewards.sol";
import { TestTime } from "./TestTime.sol";
import { Time } from "../utility/Time.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestAutoCompoundingStakingRewards is AutoCompoundingStakingRewards, TestTime {
    constructor(
        IBancorNetwork initNetwork,
        IERC20 initNetworkToken,
        IMasterPool initMasterPool
    ) AutoCompoundingStakingRewards(initNetwork, initNetworkToken, initMasterPool) {}

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}

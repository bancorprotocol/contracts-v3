// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { PendingWithdrawals } from "../network/PendingWithdrawals.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";

import { Time } from "../utility/Time.sol";

import { TestTime } from "./TestTime.sol";

contract TestPendingWithdrawals is PendingWithdrawals, TestTime {
    constructor(IBancorNetwork initNetwork, IMasterPool initMasterPool)
        PendingWithdrawals(initNetwork, initMasterPool)
    {}

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}

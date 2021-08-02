// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { PendingWithdrawals } from "../network/PendingWithdrawals.sol";

import { INetworkTokenPool } from "../pools/interfaces/INetworkTokenPool.sol";

import { Time } from "../utility/Time.sol";

import { TestTime } from "./TestTime.sol";

contract TestPendingWithdrawals is PendingWithdrawals, TestTime {
    constructor(IBancorNetwork initNetwork, INetworkTokenPool initNetworkTokenPool)
        PendingWithdrawals(initNetwork, initNetworkTokenPool)
    {}

    function _time() internal view virtual override(Time, TestTime) returns (uint256) {
        return TestTime._time();
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../network/PendingWithdrawals.sol";

import "./TestTime.sol";

contract TestPendingWithdrawals is PendingWithdrawals, TestTime {
    constructor(IBancorNetwork initNetwork, INetworkTokenPool initNetworkTokenPool)
        PendingWithdrawals(initNetwork, initNetworkTokenPool)
    {}

    function _time() internal view virtual override(Time, TestTime) returns (uint256) {
        return TestTime._time();
    }
}

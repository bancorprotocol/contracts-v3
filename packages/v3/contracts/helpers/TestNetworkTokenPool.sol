// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IPendingWithdrawals } from "../network/interfaces/IPendingWithdrawals.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { NetworkTokenPool } from "../pools/NetworkTokenPool.sol";

contract TestNetworkTokenPool is NetworkTokenPool {
    constructor(
        IBancorNetwork initNetwork,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolToken initPoolToken
    ) NetworkTokenPool(initNetwork, initPendingWithdrawals, initPoolToken) {}

    function mintT(address recipient, uint256 amount) external {
        _poolToken.mint(recipient, amount);
    }
}

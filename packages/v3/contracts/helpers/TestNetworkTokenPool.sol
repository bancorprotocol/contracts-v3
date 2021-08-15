// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IPendingWithdrawals } from "../network/interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IBancorVault } from "../network/interfaces/IBancorVault.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { NetworkTokenPool } from "../pools/NetworkTokenPool.sol";

contract TestNetworkTokenPool is NetworkTokenPool {
    constructor(
        IBancorNetwork initNetwork,
        IBancorVault initVault,
        IPoolToken initPoolToken
    ) NetworkTokenPool(initNetwork, initVault, initPoolToken) {}

    function mint(address recipient, uint256 amount) external {
        _poolToken.mint(recipient, amount);
    }

    function completeWithdrawalT(
        IPendingWithdrawals pendingWithdrawals,
        bytes32 contextId,
        address provider,
        uint256 id
    ) external returns (uint256) {
        return pendingWithdrawals.completeWithdrawal(contextId, provider, id);
    }
}

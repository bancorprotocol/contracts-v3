// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { WithdrawalAmounts } from "../pools/interfaces/INetworkTokenPool.sol";
import { NetworkTokenPool } from "../pools/NetworkTokenPool.sol";

contract TestNetworkTokenPool is NetworkTokenPool {
    constructor(IBancorNetwork initNetwork, IPoolToken initPoolToken) NetworkTokenPool(initNetwork, initPoolToken) {}

    function withdrawalAmountsT(uint256 poolTokenAmount) external view returns (WithdrawalAmounts memory) {
        return _withdrawalAmounts(poolTokenAmount);
    }

    function mintT(address recipient, uint256 amount) external {
        _poolToken.mint(recipient, amount);
    }

    function setStakedBalanceT(uint256 amount) external {
        _stakedBalance = amount;
    }
}

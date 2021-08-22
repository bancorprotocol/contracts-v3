// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

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

    function mintT(address recipient, uint256 amount) external {
        _poolToken.mint(recipient, amount);
    }
}

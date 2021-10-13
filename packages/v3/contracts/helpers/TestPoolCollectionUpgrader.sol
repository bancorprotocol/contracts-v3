// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolCollection, Pool } from "../pools/interfaces/IPoolCollection.sol";

import { PoolCollectionUpgrader } from "../pools/PoolCollectionUpgrader.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

contract TestPoolCollectionUpgrader is PoolCollectionUpgrader {
    constructor(IBancorNetwork initNetwork) PoolCollectionUpgrader(initNetwork) {}

    function migratePoolDataT(
        IPoolCollection poolCollection,
        ReserveToken pool,
        Pool memory data
    ) external {
        poolCollection.migratePoolData(pool, data);
    }

    function removePoolDataT(IPoolCollection poolCollection, ReserveToken pool) external {
        poolCollection.removePoolData(pool);
    }
}

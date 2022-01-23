// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolCollection, Pool } from "../pools/interfaces/IPoolCollection.sol";

import { PoolCollectionUpgrader } from "../pools/PoolCollectionUpgrader.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

contract TestPoolCollectionUpgrader is PoolCollectionUpgrader {
    constructor(IBancorNetwork initNetwork) PoolCollectionUpgrader(initNetwork) {}

    function migratePoolInT(
        IPoolCollection poolCollection,
        ReserveToken pool,
        Pool memory data
    ) external {
        poolCollection.migratePoolIn(pool, data);
    }

    function migratePoolOutT(
        IPoolCollection poolCollection,
        ReserveToken pool,
        IPoolCollection targetPoolCollection
    ) external {
        poolCollection.migratePoolOut(pool, targetPoolCollection);
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolCollection, Pool } from "../pools/interfaces/IPoolCollection.sol";

import { PoolMigrator } from "../pools/PoolMigrator.sol";

import { Token } from "../token/Token.sol";

contract TestPoolMigrator is PoolMigrator {
    constructor(IBancorNetwork initNetwork) PoolMigrator(initNetwork) {}

    function migratePoolInT(IPoolCollection poolCollection, Token pool, Pool memory data) external {
        poolCollection.migratePoolIn(pool, data);
    }

    function migratePoolOutT(
        IPoolCollection poolCollection,
        Token pool,
        IPoolCollection targetPoolCollection
    ) external {
        poolCollection.migratePoolOut(pool, targetPoolCollection);
    }
}

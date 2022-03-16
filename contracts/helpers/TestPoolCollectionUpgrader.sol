// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolCollection, Pool } from "../pools/interfaces/IPoolCollection.sol";

import { PoolCollectionUpgrader } from "../pools/PoolCollectionUpgrader.sol";

import { Token } from "../token/Token.sol";

contract TestPoolCollectionUpgrader is PoolCollectionUpgrader {
    constructor(IBancorNetwork initNetwork) PoolCollectionUpgrader(initNetwork) {}

    function migratePoolInT(
        IPoolCollection poolCollection,
        Token pool,
        Pool memory data
    ) external {
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

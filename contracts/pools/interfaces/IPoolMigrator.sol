// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Token } from "../../token/Token.sol";

import { IVersioned } from "../../utility/interfaces/IVersioned.sol";

import { IPoolCollection } from "./IPoolCollection.sol";

/**
 * @dev Pool Migrator interface
 */
interface IPoolMigrator is IVersioned {
    /**
     * @dev migrates a pool and returns the new pool collection it exists in
     *
     * notes:
     *
     * - invalid or incompatible pools will be skipped gracefully
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function migratePool(Token pool, IPoolCollection newPoolCollection) external;
}

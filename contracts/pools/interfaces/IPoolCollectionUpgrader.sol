// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";

import { Token } from "../../token/Token.sol";

import { IVersioned } from "../../utility/interfaces/IVersioned.sol";

import { IPoolCollection } from "./IPoolCollection.sol";

/**
 * @dev Pool Collection Upgrader interface
 */
interface IPoolCollectionUpgrader is IVersioned {
    /**
     * @dev upgrades a pool and returns the new pool collection it exists in
     *
     * notes:
     *
     * - invalid or incompatible pools will be skipped gracefully
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function upgradePool(Token pool) external returns (IPoolCollection);
}

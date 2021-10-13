// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

import { IVersioned } from "../../utility/interfaces/IVersioned.sol";

import { IPoolCollection } from "./IPoolCollection.sol";

/**
 * @dev Pool Collection Upgrader interface
 */
interface IPoolCollectionUpgrader is IVersioned {
    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev upgrades a pool and returns the previous and the new pool collection it exists in
     *
     * notes:
     *
     * - invalid or incompatible pools will be skipped gracefully
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function upgradePool(ReserveToken pool) external returns (IPoolCollection, IPoolCollection);
}

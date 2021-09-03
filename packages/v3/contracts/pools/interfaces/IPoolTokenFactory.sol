// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IReserveToken } from "../../token/interfaces/IReserveToken.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IPoolToken } from "./IPoolToken.sol";

/**
 * @dev Pool Token Factory interface
 */
interface IPoolTokenFactory is IUpgradeable {
    /**
     * @dev returns the custom symbol override for a given reserve token
     */
    function tokenSymbolOverride(IReserveToken reserveToken) external view returns (string memory);

    /**
     * @dev returns the custom decimal override for a given reserve token
     */
    function tokenDecimalOverride(IReserveToken reserveToken) external view returns (uint8);

    /**
     * @dev creates a pool token for the specified token
     */
    function createPoolToken(IReserveToken reserveToken) external returns (address);
}

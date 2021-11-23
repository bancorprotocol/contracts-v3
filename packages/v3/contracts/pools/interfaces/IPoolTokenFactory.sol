// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { ReserveToken } from "../../token/ReserveToken.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IPoolToken } from "./IPoolToken.sol";

/**
 * @dev Pool Token Factory interface
 */
interface IPoolTokenFactory is IUpgradeable {
    /**
     * @dev returns the custom symbol override for a given reserve token
     */
    function tokenSymbolOverride(ReserveToken reserveToken) external view returns (string memory);

    /**
     * @dev returns the custom decimals override for a given reserve token
     */
    function tokenDecimalsOverride(ReserveToken reserveToken) external view returns (uint8);

    /**
     * @dev creates a pool token for the specified token
     */
    function createPoolToken(ReserveToken reserveToken) external returns (IPoolToken);
}

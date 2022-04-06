// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Token } from "../../token/Token.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IPoolToken } from "./IPoolToken.sol";

/**
 * @dev Pool Token Factory interface
 */
interface IPoolTokenFactory is IUpgradeable {
    /**
     * @dev returns the custom symbol override for a given reserve token
     */
    function tokenSymbolOverride(Token token) external view returns (string memory);

    /**
     * @dev returns the custom decimals override for a given reserve token
     */
    function tokenDecimalsOverride(Token token) external view returns (uint8);

    /**
     * @dev creates a pool token for the specified token
     */
    function createPoolToken(Token token) external returns (IPoolToken);
}

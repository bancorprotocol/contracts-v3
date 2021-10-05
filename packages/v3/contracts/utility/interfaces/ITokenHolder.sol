// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { ReserveToken } from "../../token/ReserveToken.sol";

import { IOwned } from "./IOwned.sol";

/**
 * @dev Token Holder interface
 */
interface ITokenHolder is IOwned {
    receive() external payable;

    /**
     * @dev withdraws funds held by the contract and sends them to an account
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function withdrawTokens(
        ReserveToken reserveToken,
        address payable to,
        uint256 amount
    ) external;

    /**
     * @dev withdraws multiple funds held by the contract and sends them to an account
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function withdrawTokensMultiple(
        ReserveToken[] calldata reserveTokens,
        address payable to,
        uint256[] calldata amounts
    ) external;
}

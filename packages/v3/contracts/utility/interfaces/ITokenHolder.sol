// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../../token/interfaces/IReserveToken.sol";

import "./IOwned.sol";

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
        IReserveToken reserveToken,
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
        IReserveToken[] calldata reserveTokens,
        address payable to,
        uint256[] calldata amounts
    ) external;
}

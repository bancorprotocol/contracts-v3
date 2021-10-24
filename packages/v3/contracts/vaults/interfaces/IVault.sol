// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

interface IVault is IUpgradeable {
    /**
     * @dev triggered when tokens have been withdrawn from the vault
     */
    event FundsWithdrawn(ReserveToken indexed token, address indexed caller, address indexed target, uint256 amount);

    /**
     * @dev tells if the contracts accepts ETH deposits
     */
    function isPayable() external view returns (bool);

    /**
     * @dev withdraws funds held by the contract and sends them to an account
     */
    function withdrawFunds(
        ReserveToken reserveToken,
        address payable target,
        uint256 amount
    ) external;

    /**
     * @dev returns whether withdrawals are currently paused
     */
    function isPaused() external view returns (bool);

    /**
     * @dev pauses withdrawals
     *
     * requirements:
     *
     * - the caller must have the ROLE_ADMIN privileges
     */
    function pause() external;

    /**
     * @dev unpauses withdrawals
     *
     * requirements:
     *
     * - the caller must have the ROLE_ADMIN privileges
     */
    function unpause() external;
}

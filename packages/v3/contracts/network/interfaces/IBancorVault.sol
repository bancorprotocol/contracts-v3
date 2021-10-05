// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

/**
 * @dev Bancor Vault interface
 */
interface IBancorVault is IUpgradeable {
    receive() external payable;

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

    /**
     * @dev withdraws funds held by the contract and sends them to an account
     *
     * requirements:
     *
     * - the contract shouldn't be paused
     * - the caller must have the right privileges to withdraw this token:
     *   - for the network token: the ROLE_NETWORK_TOKEN_MANAGER or the ROLE_ASSET_MANAGER role
     *   - for any other reserve token or ETH: the ROLE_ASSET_MANAGER role
     */
    function withdrawTokens(
        ReserveToken reserveToken,
        address payable target,
        uint256 amount
    ) external;
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";

import { IReserveToken } from "../../token/interfaces/IReserveToken.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { INetworkSettings } from "./INetworkSettings.sol";
import { IBancorNetwork } from "./IBancorNetwork.sol";

/**
 * @dev The data struct representing a pending withdrawal request
 */
struct WithdrawalRequest {
    // the liquidity provider
    address provider;
    // the locked pool token
    IPoolToken poolToken;
    // the time when the request was created (Unix timestamp))
    uint32 createdAt;
    // the locked pool token amount
    uint256 poolTokenAmount;
}

/**
 * @dev The data struct representing a completed withdrawal request
 */
struct CompletedWithdrawalRequest {
    // the transferred pool token
    IPoolToken poolToken;
    // the transferred pool token amount
    uint256 poolTokenAmount;
}

/**
 * @dev Pending Withdrawals interface
 */
interface IPendingWithdrawals is IUpgradeable {
    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev returns the lock duration
     */
    function lockDuration() external view returns (uint32);

    /**
     * @dev returns withdrawal window duration
     */
    function withdrawalWindowDuration() external view returns (uint32);

    /**
     * @dev returns the pending withdrawal requests count for a specific provider
     */
    function withdrawalRequestCount(address provider) external view returns (uint256);

    /**
     * @dev returns the pending withdrawal requests IDs for a specific provider
     */
    function withdrawalRequestIds(address provider) external view returns (uint256[] memory);

    /**
     * @dev returns the pending withdrawal request with the specified ID
     */
    function withdrawalRequest(uint256 id) external view returns (WithdrawalRequest memory);

    /**
     * @dev initiates liquidity withdrawal
     *
     * requirements:
     *
     * - the caller must have approved the contract to transfer the pool token amount on its behalf
     */
    function initWithdrawal(IPoolToken poolToken, uint256 poolTokenAmount) external;

    /**
     * @dev initiates liquidity withdrawal by providing an EIP712 typed signature for an EIP2612 permit request
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    function initWithdrawalDelegated(
        IPoolToken poolToken,
        uint256 poolTokenAmount,
        address provider,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev cancels a withdrawal request
     *
     * requirements:
     *
     * - the caller must have already initiated a withdrawal and received the specified id
     */
    function cancelWithdrawal(uint256 id) external;

    /**
     * @dev reinitiates a withdrawal request and restarts its cooldown durations
     *
     * requirements:
     *
     * - the caller must have already initiated a withdrawal and received the specified id
     */
    function reinitWithdrawal(uint256 id) external;

    /**
     * @dev completes a withdrawal request and returns the pool token and its transferred amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the provider must have already initiated a withdrawal and received the specified id
     * - the current time is older than the lock duration but not older than the lock duration + withdrawal window duration
     */
    function completeWithdrawal(
        bytes32 contextId,
        address provider,
        uint256 id
    ) external returns (CompletedWithdrawalRequest memory);
}

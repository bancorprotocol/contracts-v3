// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";

import { Token } from "../../token/Token.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

/**
 * @dev the data struct representing a pending withdrawal request
 */
struct WithdrawalRequest {
    address provider; // the liquidity provider
    IPoolToken poolToken; // the locked pool token
    Token reserveToken; // the reserve token to withdraw
    uint32 createdAt; // the time when the request was created (Unix timestamp)
    uint256 poolTokenAmount; // the locked pool token amount
    uint256 reserveTokenAmount; // the expected reserve token amount to withdraw
}

/**
 * @dev the data struct representing a completed withdrawal request
 */
struct CompletedWithdrawal {
    IPoolToken poolToken; // the withdraw pool token
    uint256 poolTokenAmount; // the original pool token amount in the withdrawal request
    uint256 reserveTokenAmount; // the original reserve token amount at the time of the withdrawal init request
}

/**
 * @dev Pending Withdrawals interface
 */
interface IPendingWithdrawals is IUpgradeable {
    /**
     * @dev returns the lock duration
     */
    function lockDuration() external view returns (uint32);

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
     * - the caller must be the network contract
     */
    function initWithdrawal(
        address provider,
        IPoolToken poolToken,
        uint256 poolTokenAmount
    ) external returns (uint256);

    /**
     * @dev cancels a withdrawal request, and returns the number of pool tokens which were sent back to the provider
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the provider must have already initiated a withdrawal and received the specified id
     */
    function cancelWithdrawal(address provider, uint256 id) external returns (uint256);

    /**
     * @dev completes a withdrawal request, and returns the pool token and its transferred amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the provider must have already initiated a withdrawal and received the specified id
     * - the lock duration has ended
     */
    function completeWithdrawal(
        bytes32 contextId,
        address provider,
        uint256 id
    ) external returns (CompletedWithdrawal memory);

    /**
     * @dev returns whether the given request is ready for withdrawal
     */
    function isReadyForWithdrawal(uint256 id) external view returns (bool);
}

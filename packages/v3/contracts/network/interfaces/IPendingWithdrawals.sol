// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../../pools/interfaces/IPoolToken.sol";
import "../../pools/interfaces/INetworkTokenPool.sol";

import "../../token/interfaces/IReserveToken.sol";

import "../../utility/interfaces/IUpgradeable.sol";

import "./INetworkSettings.sol";
import "./IBancorNetwork.sol";

/**
 * @dev Pending Withdrawals interface
 */
interface IPendingWithdrawals is IUpgradeable {
    struct Position {
        IPoolToken poolToken;
        uint256 amount;
        uint256 createdAt;
    }

    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev returns the network token pool contract
     */
    function networkTokenPool() external view returns (INetworkTokenPool);

    /**
     * @dev returns mapping between accounts and their pending positions
     */
    function positions(address account) external view returns (Position[] memory);

    /**
     * @dev returns the lock duration
     */
    function lockDuration() external view returns (uint256);

    /**
     * @dev returns withdrawal window duration
     */
    function withdrawalWindowDuration() external view returns (uint256);

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
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IPoolToken } from "./IPoolToken.sol";

import { Token } from "../../token/Token.sol";

import { IVault } from "../../vaults/interfaces/IVault.sol";

// the BNT pool token manager role is required to access the BNT pool tokens
bytes32 constant ROLE_BNT_POOL_TOKEN_MANAGER = keccak256("ROLE_BNT_POOL_TOKEN_MANAGER");

// the BNT manager role is required to request the BNT pool to mint BNT
bytes32 constant ROLE_BNT_MANAGER = keccak256("ROLE_BNT_MANAGER");

// the vault manager role is required to request the BNT pool to burn BNT from the master vault
bytes32 constant ROLE_VAULT_MANAGER = keccak256("ROLE_VAULT_MANAGER");

// the funding manager role is required to request or renounce funding from the BNT pool
bytes32 constant ROLE_FUNDING_MANAGER = keccak256("ROLE_FUNDING_MANAGER");

/**
 * @dev BNT Pool interface
 */
interface IBNTPool is IVault {
    /**
     * @dev returns the BNT pool token contract
     */
    function poolToken() external view returns (IPoolToken);

    /**
     * @dev returns the total staked BNT balance in the network
     */
    function stakedBalance() external view returns (uint256);

    /**
     * @dev returns the current funding of given pool
     */
    function currentPoolFunding(Token pool) external view returns (uint256);

    /**
     * @dev returns the available BNT funding for a given pool
     */
    function availableFunding(Token pool) external view returns (uint256);

    /**
     * @dev converts the specified pool token amount to the underlying BNT amount
     */
    function poolTokenToUnderlying(uint256 poolTokenAmount) external view returns (uint256);

    /**
     * @dev converts the specified underlying BNT amount to pool token amount
     */
    function underlyingToPoolToken(uint256 bntAmount) external view returns (uint256);

    /**
     * @dev returns the number of pool token to burn in order to increase everyone's underlying value by the specified
     * amount
     */
    function poolTokenAmountToBurn(uint256 bntAmountToDistribute) external view returns (uint256);

    /**
     * @dev mints BNT to the recipient
     *
     * requirements:
     *
     * - the caller must have the ROLE_BNT_MANAGER role
     */
    function mint(address recipient, uint256 bntAmount) external;

    /**
     * @dev burns BNT from the vault
     *
     * requirements:
     *
     * - the caller must have the ROLE_VAULT_MANAGER role
     */
    function burnFromVault(uint256 bntAmount) external;

    /**
     * @dev deposits BNT liquidity on behalf of a specific provider and returns the respective pool token amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - BNT tokens must have been already deposited into the contract
     */
    function depositFor(
        bytes32 contextId,
        address provider,
        uint256 bntAmount,
        bool isMigrating,
        uint256 originalVBNTAmount
    ) external returns (uint256);

    /**
     * @dev withdraws BNT liquidity on behalf of a specific provider and returns the withdrawn BNT amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - bnBNT token must have been already deposited into the contract
     * - vBNT token must have been already deposited into the contract
     */
    function withdraw(
        bytes32 contextId,
        address provider,
        uint256 poolTokenAmount,
        uint256 bntAmount
    ) external returns (uint256);

    /**
     * @dev returns the withdrawn BNT amount
     */
    function withdrawalAmount(uint256 poolTokenAmount) external view returns (uint256);

    /**
     * @dev requests BNT funding
     *
     * requirements:
     *
     * - the caller must have the ROLE_FUNDING_MANAGER role
     * - the token must have been whitelisted
     * - the request amount should be below the funding limit for a given pool
     * - the average rate of the pool must not deviate too much from its spot rate
     */
    function requestFunding(
        bytes32 contextId,
        Token pool,
        uint256 bntAmount
    ) external;

    /**
     * @dev renounces BNT funding
     *
     * requirements:
     *
     * - the caller must have the ROLE_FUNDING_MANAGER role
     * - the token must have been whitelisted
     * - the average rate of the pool must not deviate too much from its spot rate
     */
    function renounceFunding(
        bytes32 contextId,
        Token pool,
        uint256 bntAmount
    ) external;

    /**
     * @dev notifies the pool of accrued fees
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function onFeesCollected(
        Token pool,
        uint256 feeAmount,
        bool isTradeFee
    ) external;
}

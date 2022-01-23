// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IPoolToken } from "./IPoolToken.sol";
import { IPoolCollection } from "./IPoolCollection.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../../network/interfaces/INetworkSettings.sol";
import { IMasterVault } from "../../vaults/interfaces/IMasterVault.sol";

import { IVault } from "../../vaults/interfaces/IVault.sol";

// the network token manager role is required to request the master pool to mint network tokens
bytes32 constant ROLE_NETWORK_TOKEN_MANAGER = keccak256("ROLE_NETWORK_TOKEN_MANAGER");

// the vault manager role is required to request the master pool to burn network tokens from the master vault
bytes32 constant ROLE_VAULT_MANAGER = keccak256("ROLE_VAULT_MANAGER");

// the funding manager role is required to request or renounce funding from the master pool
bytes32 constant ROLE_FUNDING_MANAGER = keccak256("ROLE_FUNDING_MANAGER");

/**
 * @dev Master Pool interface
 */
interface IMasterPool is IVault {
    /**
     * @dev returns the master pool token contract
     */
    function poolToken() external view returns (IPoolToken);

    /**
     * @dev returns the total staked network token balance in the network
     */
    function stakedBalance() external view returns (uint256);

    /**
     * @dev returns the current funding of given pool
     */
    function currentPoolFunding(ReserveToken pool) external view returns (uint256);

    /**
     * @dev returns the available network token funding for a given pool
     */
    function availableFunding(ReserveToken pool) external view returns (uint256);

    /**
     * @dev converts the specified pool token amount to the underlying network token amount
     */
    function poolTokenToUnderlying(uint256 poolTokenAmount) external view returns (uint256);

    /**
     * @dev converts the specified underlying network token amount to pool token amount
     */
    function underlyingToPoolToken(uint256 networkTokenAmount) external view returns (uint256);

    /**
     * @dev returns the number of pool token to burn in order to increase everyone's underlying value by the specified
     * amount
     */
    function poolTokenAmountToBurn(uint256 networkTokenAmountToDistribute) external view returns (uint256);

    /**
     * @dev mints network tokens to the recipient
     *
     * requirements:
     *
     * - the caller must have the ROLE_NETWORK_TOKEN_MANAGER role
     */
    function mint(address recipient, uint256 networkTokenAmount) external;

    /**
     * @dev burns network tokens from the vault
     *
     * requirements:
     *
     * - the caller must have the ROLE_VAULT_MANAGER role
     */
    function burnFromVault(uint256 networkTokenAmount) external;

    /**
     * @dev deposits network token liquidity on behalf of a specific provider
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the network tokens must have been already deposited into the contract
     */
    function depositFor(
        bytes32 contextId,
        address provider,
        uint256 networkTokenAmount,
        bool isMigrating,
        uint256 originalGovTokenAmount
    ) external;

    /**
     * @dev withdraws network token liquidity on behalf of a specific provider and returns the withdrawn network token
     * amount and burned pool token amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the governance tokens must have been already deposited into the contract
     */
    function withdraw(
        bytes32 contextId,
        address provider,
        uint256 poolTokenAmount
    ) external;

    /**
     * @dev requests network token funding
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
        ReserveToken pool,
        uint256 networkTokenAmount
    ) external;

    /**
     * @dev renounces network token funding
     *
     * requirements:
     *
     * - the caller must have the ROLE_FUNDING_MANAGER role
     * - the token must have been whitelisted
     * - the average rate of the pool must not deviate too much from its spot rate
     */
    function renounceFunding(
        bytes32 contextId,
        ReserveToken pool,
        uint256 networkTokenAmount
    ) external;

    /**
     * @dev notifies the pool of accrued fees
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function onFeesCollected(
        ReserveToken pool,
        uint256 feeAmount,
        uint8 feeType
    ) external;
}

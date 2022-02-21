// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IPoolToken } from "./IPoolToken.sol";
import { IPoolCollection } from "./IPoolCollection.sol";

import { Token } from "../../token/Token.sol";

import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../../network/interfaces/INetworkSettings.sol";
import { IMasterVault } from "../../vaults/interfaces/IMasterVault.sol";

import { IVault } from "../../vaults/interfaces/IVault.sol";

// the BNT manager role is required to request the master pool to mint BNTs
bytes32 constant ROLE_BNT_MANAGER = keccak256("ROLE_BNT_MANAGER");

// the vault manager role is required to request the master pool to burn BNTs from the master vault
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
     * @dev mints BNTs to the recipient
     *
     * requirements:
     *
     * - the caller must have the ROLE_BNT_MANAGER role
     */
    function mint(address recipient, uint256 bntAmount) external;

    /**
     * @dev burns BNTs from the vault
     *
     * requirements:
     *
     * - the caller must have the ROLE_VAULT_MANAGER role
     */
    function burnFromVault(uint256 bntAmount) external;

    /**
     * @dev deposits BNT liquidity on behalf of a specific provider
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the BNTs must have been already deposited into the contract
     */
    function depositFor(
        bytes32 contextId,
        address provider,
        uint256 bntAmount,
        bool isMigrating,
        uint256 originalVBNTAmount
    ) external;

    /**
     * @dev withdraws BNT liquidity on behalf of a specific provider and returns the withdrawn BNT
     * amount and burned pool token amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the VBNTs must have been already deposited into the contract
     */
    function withdraw(
        bytes32 contextId,
        address provider,
        uint256 poolTokenAmount
    ) external;

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

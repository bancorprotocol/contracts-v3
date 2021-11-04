// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";
import { IExternalProtectionVault } from "../../vaults/interfaces/IExternalProtectionVault.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

import { IPoolCollection, TradeAmounts } from "../../pools/interfaces/IPoolCollection.sol";
import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";
import { INetworkTokenPool } from "../../pools/interfaces/INetworkTokenPool.sol";
import { IPoolCollectionUpgrader } from "../../pools/interfaces/IPoolCollectionUpgrader.sol";

import { INetworkSettings } from "./INetworkSettings.sol";
import { IBancorVault } from "./../../vaults/interfaces/IBancorVault.sol";
import { IPendingWithdrawals } from "./IPendingWithdrawals.sol";

/**
 * @dev Flash-loan recipient interface
 */
interface IFlashLoanRecipient {
    /**
     * @dev a flash-loan recipient callback after each the caller must return the borrowed amount and an additional fee
     */
    function onFlashLoan(
        address sender,
        IERC20 token,
        uint256 amount,
        uint256 feeAmount,
        bytes memory data
    ) external;
}

/**
 * @dev Bancor Network interface
 */
interface IBancorNetwork is IUpgradeable {
    /**
     * @dev returns the network token contract
     */
    function networkToken() external view returns (IERC20);

    /**
     * @dev returns the network token governance contract
     */
    function networkTokenGovernance() external view returns (ITokenGovernance);

    /**
     * @dev returns the governance token contract
     */
    function govToken() external view returns (IERC20);

    /**
     * @dev returns the governance token governance contract
     */
    function govTokenGovernance() external view returns (ITokenGovernance);

    /**
     * @dev returns the network settings contract
     */
    function settings() external view returns (INetworkSettings);

    /**
     * @dev returns the vault contract
     */
    function vault() external view returns (IBancorVault);

    /**
     * @dev returns the network token pool token contract
     */
    function networkPoolToken() external view returns (IPoolToken);

    /**
     * @dev returns the network token pool contract
     */
    function networkTokenPool() external view returns (INetworkTokenPool);

    /**
     * @dev returns the pending withdrawals contract
     */
    function pendingWithdrawals() external view returns (IPendingWithdrawals);

    /**
     * @dev returns the pool collection upgrader contract
     */
    function poolCollectionUpgrader() external view returns (IPoolCollectionUpgrader);

    /**
     * @dev returns the address of the external protection wallet
     */
    function externalProtectionVault() external view returns (IExternalProtectionVault);

    /**
     * @dev returns the set of all valid pool collections
     */
    function poolCollections() external view returns (IPoolCollection[] memory);

    /**
     * @dev returns the most recent collection that was added to the pool collections set for a specific type
     */
    function latestPoolCollection(uint16 poolType) external view returns (IPoolCollection);

    /**
     * @dev returns the set of all liquidity pools
     */
    function liquidityPools() external view returns (ReserveToken[] memory);

    /**
     * @dev returns the respective pool collection for the provided pool
     */
    function collectionByPool(ReserveToken pool) external view returns (IPoolCollection);

    /**
     * @dev returns whether the pool is valid
     */
    function isPoolValid(ReserveToken pool) external view returns (bool);

    /**
     * @dev creates a new pool
     *
     * requirements:
     *
     * - the pool doesn't exist
     */
    function createPool(uint16 poolType, ReserveToken reserveToken) external;

    /**
     * @dev upgrades a list of pools
     *
     * notes:
     *
     * - invalid or incompatible pools will be skipped gracefully
     */
    function upgradePools(ReserveToken[] calldata pools) external;

    /**
     * @dev deposits liquidity for the specified provider
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the liquidity tokens on its behalf
     */
    function depositFor(
        address provider,
        ReserveToken pool,
        uint256 tokenAmount
    ) external payable;

    /**
     * @dev deposits liquidity for the current provider
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the liquidity tokens on its behalf
     */
    function deposit(ReserveToken pool, uint256 tokenAmount) external payable;

    /**
     * @dev deposits liquidity for the specified provider by providing an EIP712 typed signature for an EIP2612 permit
     * request
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    function depositForPermitted(
        address provider,
        ReserveToken pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev deposits liquidity by providing an EIP712 typed signature for an EIP2612 permit
     * request
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    function depositPermitted(
        ReserveToken pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev withdraws liquidity
     *
     * requirements:
     *
     * - the provider must have already initiated a withdrawal and received the specified id
     * - the specified withdrawal request is eligble for completion
     * - the provider must have approved the network to transfer the governance token amount on its behalf, when
     * withdrawing network token liquidity
     */
    function withdraw(uint256 id) external;

    /**
     * @dev performs a trade and returns the target amount and fee
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the source tokens on its behalf, in the non-ETH case
     */
    function trade(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary
    ) external payable;

    /**
     * @dev performs a trade by providing an EIP712 typed signature for an EIP2612 permit request and returns the target
     * amount and fee
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */

    function tradePermitted(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev provides a flash-loan
     *
     * requirements:
     *
     * - the recipient's callback must return *at least* the borrowed amount and fee back to the specified return address
     */
    function flashLoan(
        ReserveToken token,
        uint256 amount,
        IFlashLoanRecipient recipient,
        bytes calldata data
    ) external;
}

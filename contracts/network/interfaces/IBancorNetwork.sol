// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { Token } from "../../token/Token.sol";

import { IPoolCollection } from "../../pools/interfaces/IPoolCollection.sol";
import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";

/**
 * @dev Flash-loan recipient interface
 */
interface IFlashLoanRecipient {
    /**
     * @dev a flash-loan recipient callback after each the caller must return the borrowed amount and an additional fee
     */
    function onFlashLoan(
        address caller,
        IERC20 erc20Token,
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
     * @dev returns the set of all valid pool collections
     */
    function poolCollections() external view returns (IPoolCollection[] memory);

    /**
     * @dev returns the set of all liquidity pools
     */
    function liquidityPools() external view returns (Token[] memory);

    /**
     * @dev returns the respective pool collection for the provided pool
     */
    function collectionByPool(Token pool) external view returns (IPoolCollection);

    /**
     * @dev creates new pools
     *
     * requirements:
     *
     * - none of the pools already exists
     */
    function createPools(Token[] calldata tokens, IPoolCollection poolCollection) external;

    /**
     * @dev migrates a list of pools between pool collections
     *
     * notes:
     *
     * - invalid or incompatible pools will be skipped gracefully
     */
    function migratePools(Token[] calldata pools, IPoolCollection newPoolCollection) external;

    /**
     * @dev deposits liquidity for the specified provider and returns the respective pool token amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the tokens on its behalf (except for in the
     *   native token case)
     */
    function depositFor(
        address provider,
        Token pool,
        uint256 tokenAmount
    ) external payable returns (uint256);

    /**
     * @dev deposits liquidity for the current provider and returns the respective pool token amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the tokens on its behalf (except for in the
     *   native token case)
     */
    function deposit(Token pool, uint256 tokenAmount) external payable returns (uint256);

    /**
     * @dev initiates liquidity withdrawal
     *
     * requirements:
     *
     * - the caller must have approved the contract to transfer the pool token amount on its behalf
     */
    function initWithdrawal(IPoolToken poolToken, uint256 poolTokenAmount) external returns (uint256);

    /**
     * @dev cancels a withdrawal request, and returns the number of pool token amount associated with the withdrawal
     * request
     *
     * requirements:
     *
     * - the caller must have already initiated a withdrawal and received the specified id
     */
    function cancelWithdrawal(uint256 id) external returns (uint256);

    /**
     * @dev withdraws liquidity and returns the withdrawn amount
     *
     * requirements:
     *
     * - the provider must have already initiated a withdrawal and received the specified id
     * - the specified withdrawal request is eligible for completion
     * - the provider must have approved the network to transfer vBNT amount on its behalf, when withdrawing BNT
     * liquidity
     */
    function withdraw(uint256 id) external returns (uint256);

    /**
     * @dev performs a trade by providing the input source amount, sends the proceeds to the optional beneficiary (or
     * to the address of the caller, in case it's not supplied), and returns the trade target amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the source tokens on its behalf (except for in the
     *   native token case)
     */
    function tradeBySourceAmount(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary
    ) external payable returns (uint256);

    /**
     * @dev performs a trade by providing the output target amount, sends the proceeds to the optional beneficiary (or
     * to the address of the caller, in case it's not supplied), and returns the trade source amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the source tokens on its behalf (except for in the
     *   native token case)
     */
    function tradeByTargetAmount(
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount,
        uint256 maxSourceAmount,
        uint256 deadline,
        address beneficiary
    ) external payable returns (uint256);

    /**
     * @dev provides a flash-loan
     *
     * requirements:
     *
     * - the recipient's callback must return *at least* the borrowed amount and fee back to the specified return address
     */
    function flashLoan(
        Token token,
        uint256 amount,
        IFlashLoanRecipient recipient,
        bytes calldata data
    ) external;

    /**
     * @dev deposits liquidity during a migration
     */
    function migrateLiquidity(
        Token token,
        address provider,
        uint256 amount,
        uint256 availableAmount,
        uint256 originalAmount
    ) external payable;

    /**
     * @dev withdraws pending network fees, and returns the amount of fees withdrawn
     *
     * requirements:
     *
     * - the caller must have the ROLE_NETWORK_FEE_MANAGER privilege
     */
    function withdrawNetworkFees(address recipient) external returns (uint256);
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/0.7.6/contracts/TokenGovernance.sol";

import { IPoolToken } from "./IPoolToken.sol";

import { IReserveToken } from "../../token/interfaces/IReserveToken.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../../network/interfaces/INetworkSettings.sol";
import { IBancorVault } from "../../network/interfaces/IBancorVault.sol";
import { IPendingWithdrawals } from "../../network/interfaces/IPendingWithdrawals.sol";

struct DepositAmounts {
    // the provided network token amount
    uint256 networkTokenAmount;
    // the minted pool token amount
    uint256 poolTokenAmount;
    // the minted gov token amount
    uint256 govTokenAmount;
}

struct WithdrawalAmounts {
    // the withdrawn network token amount
    uint256 networkTokenAmount;
    // the burned pool token amount
    uint256 poolTokenAmount;
}

/**
 * @dev Network Token Pool interface
 */
interface INetworkTokenPool is IUpgradeable {
    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

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
    function poolToken() external view returns (IPoolToken);

    /**
     * @dev returns the pending withdrawals contract
     */
    function pendingWithdrawals() external view returns (IPendingWithdrawals);

    /**
     * @dev returns the total staked network token balance in the network
     */
    function stakedBalance() external view returns (uint256);

    /**
     * @dev returns the total minted amount for a given pool
     */
    function mintedAmounts(IReserveToken pool) external view returns (uint256);

    /**
     * @dev deposits network token liquidity on behalf of a specific provider
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the network tokens must have been already deposited into the contract
     */
    function depositFor(
        address provider,
        uint256 networkTokenAmount,
        bool isMigrating,
        uint256 originalNetworkTokenAmount
    ) external returns (DepositAmounts memory);

    /**
     * @dev withdraws network token liquidity on behalf of a specific provider and returns the withdrawn network token
     * amount and burned pool token amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the governance tokens must have been already deposited into the contract
     */
    function withdraw(address provider, uint256 poolTokenAmount) external returns (WithdrawalAmounts memory);

    /**
     * @dev requests network token liquidity by pools and returns the provided amount (which may be less than the
     * requested amount)
     *
     * requirements:
     *
     * - the caller must be the known pool collection which manages it
     * - the pool must have been whitelisted
     * - the average rate of the pool must not deviate too much from its spot rate
     */
    function requestLiquidity(
        bytes32 contextId,
        IReserveToken pool,
        uint256 networkTokenAmount,
        bool skipLimitCheck
    ) external returns (uint256);

    /**
     * @dev renounces network token liquidity by pools
     *
     * requirements:
     *
     * - the caller must be the known pool collection which manages it
     * - the pool must have been whitelisted
     * - the average rate of the pool must not deviate too much from its spot rate
     */
    function renounceLiquidity(
        bytes32 contextId,
        IReserveToken pool,
        uint256 networkTokenAmount
    ) external;

    /**
     * @dev updates the staked balance (and the minting amount for trading fees) due to fee collection
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function onFeesCollected(
        IReserveToken pool,
        uint256 amount,
        uint8 feeType
    ) external;
}

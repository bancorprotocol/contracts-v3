// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IPoolToken } from "./IPoolToken.sol";
import { IPoolCollection } from "./IPoolCollection.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../../network/interfaces/INetworkSettings.sol";
import { IBancorVault } from "../../vaults/interfaces/IBancorVault.sol";

struct DepositAmounts {
    uint256 poolTokenAmount; // the minted pool token amount
    uint256 govTokenAmount; // the minted gov token amount
}

struct WithdrawalAmounts {
    uint256 networkTokenAmount; // the withdrawn network token amount
    uint256 poolTokenAmount; // the burned pool token amount
    uint256 govTokenAmount; // the burned governance token amount
    uint256 withdrawalFeeAmount; // the withdrawal fee network token amount
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
     * @dev returns the total staked network token balance in the network
     */
    function stakedBalance() external view returns (uint256);

    /**
     * @dev returns the total minted amount for a given pool
     */
    function mintedAmount(ReserveToken pool) external view returns (uint256);

    /**
     * @dev returns whether network token liquidity minting is enabled for the provided pool
     */
    function isNetworkLiquidityEnabled(ReserveToken pool, IPoolCollection poolCollection) external view returns (bool);

    /**
     * @dev returns the unallocated co-investment network token liquidity for a given pool
     */
    function unallocatedLiquidity(ReserveToken pool) external view returns (uint256);

    /**
     * @dev mints network tokens to the recipient
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function mint(address recipient, uint256 networkTokenAmount) external;

    /**
     * @dev burns network tokens from the vault
     *
     * requirements:
     *
     * - the caller must be the network contract
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
        address provider,
        uint256 networkTokenAmount,
        bool isMigrating,
        uint256 originalGovTokenAmount
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
     * @dev requests network token liquidity
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the token must have been whitelisted
     * - the request amount should be below the minting limit for a given pool
     * - the average rate of the pool must not deviate too much from its spot rate
     */
    function requestLiquidity(
        bytes32 contextId,
        ReserveToken pool,
        uint256 networkTokenAmount
    ) external;

    /**
     * @dev renounces network token liquidity
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the token must have been whitelisted
     * - the average rate of the pool must not deviate too much from its spot rate
     */
    function renounceLiquidity(
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

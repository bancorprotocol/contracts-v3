// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IVersioned } from "../../utility/interfaces/IVersioned.sol";
import { Fraction } from "../../utility/Types.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

import { INetworkSettings } from "../../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";

import { AverageRate } from "../PoolAverageRate.sol";

import { IPoolToken } from "./IPoolToken.sol";
import { IPoolTokenFactory } from "./IPoolTokenFactory.sol";
import { IPoolCollectionUpgrader } from "./IPoolCollectionUpgrader.sol";

struct PoolLiquidity {
    uint256 networkTokenTradingLiquidity; // the network token trading liquidity
    uint256 baseTokenTradingLiquidity; // the base token trading liquidity
    uint256 tradingLiquidityProduct; // the product of the base token and network token trading liquidities (used for fee calculations)
    uint256 stakedBalance; // the staked balance
}

struct Pool {
    IPoolToken poolToken; // the pool token of a given pool
    uint32 tradingFeePPM; // the trading fee (in units of PPM)
    bool tradingEnabled; // whether trading is enabled
    bool depositingEnabled; // whether depositing is enabled
    AverageRate averageRate; // the recent average rate
    Fraction initialRate; // the initial rate of one base token in network token units in a given pool
    uint256 depositLimit; // the deposit limit
    PoolLiquidity liquidity; // the overall liquidity in the pool
}

// base toke deposit output amounts
struct DepositAmounts {
    uint256 networkTokenDeltaAmount; // the network token amount that was added to the trading liquidity
    uint256 baseTokenDeltaAmount; // the base token amount that was added to the trading liquidity
    uint256 poolTokenAmount; // the minted pool token amount
    IPoolToken poolToken; // the pool token
}

// base token withdrawal output amounts
struct WithdrawalAmounts {
    uint256 baseTokenAmountToTransferFromVaultToProvider; // the base token amount to transfer from the main vault to the provider
    uint256 networkTokenAmountToMintForProvider; // the network token amount to mint directly for the provider
    uint256 baseTokenAmountToTransferFromExternalProtectionVaultToProvider; // the base token amount to transfer from the external protection vault to the provider
    uint256 baseTokenAmountToDeductFromLiquidity; // the base token amount to deduct from the trading liquidity
    uint256 networkTokenAmountToDeductFromLiquidity; // the network token amount to deduct from the trading liquidity and burn in the vault
    uint256 baseTokenWithdrawalFeeAmount; // the base token amount to keep in the pool as a withdrawal fee
    int256 networkTokenArbitrageAmount; // the network token amount to burn or mint in the pool, in order to create an arbitrage incentive
}

struct TradeAmountsWithLiquidity {
    uint256 amount; // the source/target amount (depending on the context) resulting from the trade
    uint256 feeAmount; // the trading fee amount
    PoolLiquidity liquidity; // the updated liquidity in the pool
}

struct TradeAmounts {
    uint256 amount; // the source/target amount (depending on the context) resulting from the trade
    uint256 feeAmount; // the trading fee amount
}

/**
 * @dev Pool Collection interface
 */
interface IPoolCollection is IVersioned {
    /**
     * @dev returns the type of the pool
     */
    function poolType() external pure returns (uint16);

    /**
     * @dev returns the default trading fee (in units of PPM)
     */
    function defaultTradingFeePPM() external view returns (uint32);

    /**
     * @dev returns all the pools which are managed by this pool collection
     */
    function pools() external view returns (ReserveToken[] memory);

    /**
     * @dev returns the number of all the pools which are managed by this pool collection
     */
    function poolCount() external view returns (uint256);

    /**
     * @dev returns whether a pool is valid
     */
    function isPoolValid(ReserveToken reserveToken) external view returns (bool);

    /**
     * @dev returns whether a pool's rate is stable
     */
    function isPoolRateStable(ReserveToken reserveToken) external view returns (bool);

    /**
     * @dev returns specific pool's data
     */
    function poolData(ReserveToken reserveToken) external view returns (Pool memory);

    /**
     * @dev returns the overall liquidity in the pool
     */
    function poolLiquidity(ReserveToken reserveToken) external view returns (PoolLiquidity memory);

    /**
     * @dev creates a new pool
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the pool should have been whitelisted
     * - the pool isn't already defined in the collection
     */
    function createPool(ReserveToken reserveToken) external;

    /**
     * @dev deposits base token liquidity on behalf of a specific provider
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - assumes that the base token has been already deposited in the vault
     */
    function depositFor(
        address provider,
        ReserveToken pool,
        uint256 baseTokenAmount,
        uint256 unallocatedNetworkTokenLiquidity
    ) external returns (DepositAmounts memory);

    /**
     * @dev handles some of the withdrawal-related actions and returns all of the withdrawal-related amounts
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the caller must have approved the collection to transfer/burn the pool token amount on its behal
     */
    function withdraw(
        ReserveToken pool,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 externalProtectionVaultBalance
    ) external returns (WithdrawalAmounts memory);

    /**
     * @dev performs a trade and returns the target amount and fee
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function trade(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount
    ) external returns (TradeAmountsWithLiquidity memory);

    /**
     * @dev returns the target or source amount and fee by specifying the source and the target tokens and whether we're
     * interested in the target or source amount
     */
    function tradeAmountAndFee(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 amount,
        bool targetAmount
    ) external view returns (TradeAmounts memory);

    /**
     * @dev notifies the pool of accrued fees
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function onFeesCollected(ReserveToken pool, uint256 feeAmount) external;

    /**
     * @dev migrates a pool to this pool collection
     *
     * requirements:
     *
     * - the caller must be the pool collection upgrader contract
     */
    function migratePoolIn(ReserveToken pool, Pool calldata data) external;

    /**
     * @dev migrates a pool from this pool collection
     *
     * requirements:
     *
     * - the caller must be the pool collection upgrader contract
     */
    function migratePoolOut(ReserveToken pool, IPoolCollection targetPoolCollection) external;
}

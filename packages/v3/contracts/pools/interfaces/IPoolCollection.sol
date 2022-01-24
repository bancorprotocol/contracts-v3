// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IVersioned } from "../../utility/interfaces/IVersioned.sol";
import { Fraction, Sint256 } from "../../utility/Types.sol";

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
    uint256 stakedBalance; // the staked balance
}

struct Pool {
    IPoolToken poolToken; // the pool token of the pool
    uint32 tradingFeePPM; // the trading fee (in units of PPM)
    bool tradingEnabled; // whether trading is enabled
    bool depositingEnabled; // whether depositing is enabled
    AverageRate averageRate; // the recent average rate
    uint256 depositLimit; // the deposit limit
    PoolLiquidity liquidity; // the overall liquidity in the pool
}

// trading enabling/disabling reasons
uint8 constant TRADING_STATUS_UPDATE_DEFAULT = 0;
uint8 constant TRADING_STATUS_UPDATE_ADMIN = 1;
uint8 constant TRADING_STATUS_UPDATE_MIN_LIQUIDITY = 2;

struct TradeAmountsWithLiquidity {
    uint256 amount; // the source/target amount (depending on the context) resulting from the trade
    uint256 feeAmount; // the trading fee amount
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
    function isPoolValid(ReserveToken pool) external view returns (bool);

    /**
     * @dev returns whether a pool's rate is stable
     */
    function isPoolRateStable(ReserveToken pool) external view returns (bool);

    /**
     * @dev returns specific pool's data
     */
    function poolData(ReserveToken pool) external view returns (Pool memory);

    /**
     * @dev returns the overall liquidity in the pool
     */
    function poolLiquidity(ReserveToken pool) external view returns (PoolLiquidity memory);

    /**
     * @dev returns the pool token of the pool
     */
    function poolToken(ReserveToken pool) external view returns (IPoolToken);

    /**
     * @dev converts the specified pool token amount to the underlying network token amount
     */
    function poolTokenToUnderlying(ReserveToken pool, uint256 poolTokenAmount) external view returns (uint256);

    /**
     * @dev converts the specified underlying base token amount to pool token amount
     */
    function underlyingToPoolToken(ReserveToken pool, uint256 tokenAmount) external view returns (uint256);

    /**
     * @dev returns the number of pool token to burn in order to increase everyone's underlying value by the specified
     * amount
     */
    function poolTokenAmountToBurn(
        ReserveToken pool,
        uint256 tokenAmountToDistribute,
        uint256 protocolPoolTokenAmount
    ) external view returns (uint256);

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
        bytes32 contextId,
        address provider,
        ReserveToken pool,
        uint256 tokenAmount
    ) external;

    /**
     * @dev handles some of the withdrawal-related actions and returns all of the withdrawal-related amounts
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the caller must have approved the collection to transfer/burn the pool token amount on its behalf
     */
    function withdraw(
        bytes32 contextId,
        address provider,
        ReserveToken pool,
        uint256 poolTokenAmount
    ) external;

    /**
     * @dev performs a trade and returns the target amount and fee
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function trade(
        bytes32 contextId,
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

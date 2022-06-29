// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IVersioned } from "../../utility/interfaces/IVersioned.sol";
import { Fraction112 } from "../../utility/FractionLibrary.sol";

import { Token } from "../../token/Token.sol";

import { IPoolToken } from "./IPoolToken.sol";

struct PoolLiquidity {
    uint128 bntTradingLiquidity; // the BNT trading liquidity
    uint128 baseTokenTradingLiquidity; // the base token trading liquidity
    uint256 stakedBalance; // the staked balance
}

struct AverageRates {
    uint32 blockNumber;
    Fraction112 rate;
    Fraction112 invRate;
}

struct Pool {
    IPoolToken poolToken; // the pool token of the pool
    uint32 tradingFeePPM; // the trading fee (in units of PPM)
    bool tradingEnabled; // whether trading is enabled
    bool depositingEnabled; // whether depositing is enabled
    AverageRates averageRates; // the recent average rates
    PoolLiquidity liquidity; // the overall liquidity in the pool
}

struct WithdrawalAmounts {
    uint256 totalAmount;
    uint256 baseTokenAmount;
    uint256 bntAmount;
}

// trading enabling/disabling reasons
uint8 constant TRADING_STATUS_UPDATE_DEFAULT = 0;
uint8 constant TRADING_STATUS_UPDATE_ADMIN = 1;
uint8 constant TRADING_STATUS_UPDATE_MIN_LIQUIDITY = 2;
uint8 constant TRADING_STATUS_UPDATE_INVALID_STATE = 3;

struct TradeAmountAndFee {
    uint256 amount; // the source/target amount (depending on the context) resulting from the trade
    uint256 tradingFeeAmount; // the trading fee amount
    uint256 networkFeeAmount; // the network fee amount (always in units of BNT)
}

/**
 * @dev Pool Collection interface
 */
interface IPoolCollection is IVersioned {
    /**
     * @dev returns the type of the pool
     */
    function poolType() external view returns (uint16);

    /**
     * @dev returns the default trading fee (in units of PPM)
     */
    function defaultTradingFeePPM() external view returns (uint32);

    /**
     * @dev returns the network fee (in units of PPM)
     */
    function networkFeePPM() external view returns (uint32);

    /**
     * @dev returns all the pools which are managed by this pool collection
     */
    function pools() external view returns (Token[] memory);

    /**
     * @dev returns the number of all the pools which are managed by this pool collection
     */
    function poolCount() external view returns (uint256);

    /**
     * @dev returns whether a pool is valid
     */
    function isPoolValid(Token pool) external view returns (bool);

    /**
     * @dev returns the overall liquidity in the pool
     */
    function poolLiquidity(Token pool) external view returns (PoolLiquidity memory);

    /**
     * @dev returns the pool token of the pool
     */
    function poolToken(Token pool) external view returns (IPoolToken);

    /**
     * @dev returns the trading fee (in units of PPM)
     */
    function tradingFeePPM(Token pool) external view returns (uint32);

    /**
     * @dev returns whether trading is enabled
     */
    function tradingEnabled(Token pool) external view returns (bool);

    /**
     * @dev returns whether depositing is enabled
     */
    function depositingEnabled(Token pool) external view returns (bool);

    /**
     * @dev returns whether the pool is stable
     */
    function isPoolStable(Token pool) external view returns (bool);

    /**
     * @dev converts the specified pool token amount to the underlying base token amount
     */
    function poolTokenToUnderlying(Token pool, uint256 poolTokenAmount) external view returns (uint256);

    /**
     * @dev converts the specified underlying base token amount to pool token amount
     */
    function underlyingToPoolToken(Token pool, uint256 baseTokenAmount) external view returns (uint256);

    /**
     * @dev returns the number of pool token to burn in order to increase everyone's underlying value by the specified
     * amount
     */
    function poolTokenAmountToBurn(
        Token pool,
        uint256 baseTokenAmountToDistribute,
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
    function createPool(Token token) external;

    /**
     * @dev deposits base token liquidity on behalf of a specific provider and returns the respective pool token amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - assumes that the base token has been already deposited in the vault
     */
    function depositFor(
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 baseTokenAmount
    ) external returns (uint256);

    /**
     * @dev handles some of the withdrawal-related actions and returns the withdrawn base token amount
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the caller must have approved the collection to transfer/burn the pool token amount on its behalf
     */
    function withdraw(
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 poolTokenAmount,
        uint256 baseTokenAmount
    ) external returns (uint256);

    /**
     * @dev returns the amounts that would be returned if the position is currently withdrawn,
     * along with the breakdown of the base token and the BNT compensation
     */
    function withdrawalAmounts(Token pool, uint256 poolTokenAmount) external view returns (WithdrawalAmounts memory);

    /**
     * @dev performs a trade by providing the source amount and returns the target amount and the associated fee
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function tradeBySourceAmount(
        bytes32 contextId,
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount
    ) external returns (TradeAmountAndFee memory);

    /**
     * @dev performs a trade by providing the target amount and returns the required source amount and the associated fee
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function tradeByTargetAmount(
        bytes32 contextId,
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount,
        uint256 maxSourceAmount
    ) external returns (TradeAmountAndFee memory);

    /**
     * @dev returns the output amount and fee when trading by providing the source amount
     */
    function tradeOutputAndFeeBySourceAmount(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount
    ) external view returns (TradeAmountAndFee memory);

    /**
     * @dev returns the input amount and fee when trading by providing the target amount
     */
    function tradeInputAndFeeByTargetAmount(
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount
    ) external view returns (TradeAmountAndFee memory);

    /**
     * @dev notifies the pool of accrued fees
     *
     * requirements:
     *
     * - the caller must be the network contract
     */
    function onFeesCollected(Token pool, uint256 feeAmount) external;

    /**
     * @dev migrates a pool to this pool collection
     *
     * requirements:
     *
     * - the caller must be the pool migrator contract
     */
    function migratePoolIn(Token pool, Pool calldata data) external;

    /**
     * @dev migrates a pool from this pool collection
     *
     * requirements:
     *
     * - the caller must be the pool migrator contract
     */
    function migratePoolOut(Token pool, IPoolCollection targetPoolCollection) external;
}

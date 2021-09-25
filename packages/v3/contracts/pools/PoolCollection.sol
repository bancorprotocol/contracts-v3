// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/SafeCast.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";
import { ReserveToken } from "../token/ReserveToken.sol";

import { Fraction } from "../utility/Types.sol";
import { MAX_UINT128, PPM_RESOLUTION } from "../utility/Constants.sol";
import { Owned } from "../utility/Owned.sol";
import { Time } from "../utility/Time.sol";
import { Utils } from "../utility/Utils.sol";
import { MathEx } from "../utility/MathEx.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolTokenFactory } from "./interfaces/IPoolTokenFactory.sol";
import { IPoolCollection, PoolLiquidity, Pool, DepositAmounts, WithdrawalAmounts, TradeAmounts } from "./interfaces/IPoolCollection.sol";

import { PoolAverageRate, AverageRate } from "./PoolAverageRate.sol";

/**
 * @dev Pool Collection contract
 *
 * notes:
 *
 * - in Bancor V3, the address of reserve token serves as the pool unique ID in both contract functions and events
 */
contract PoolCollection is IPoolCollection, Owned, ReentrancyGuardUpgradeable, Time, Utils {
    using SafeMath for uint256;
    using SafeCast for uint256;
    using ReserveToken for IReserveToken;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    uint32 private constant DEFAULT_TRADING_FEE_PPM = 2000; // 0.2%

    // trading enabling/disabling reasons
    uint8 private constant TRADING_STATUS_UPDATE_OWNER = 0;
    uint8 private constant TRADING_STATUS_UPDATE_MIN_LIQUIDITY = 1;

    // withdrawal-related input data
    struct PoolWithdrawalParams {
        uint256 networkTokenAvgTradingLiquidity;
        uint256 baseTokenAvgTradingLiquidity;
        uint256 baseTokenTradingLiquidity;
        uint256 basePoolTokenTotalSupply;
        uint256 baseTokenStakedAmount;
        uint256 tradeFeePPM;
    }

    // deposit-related output data
    struct PoolDepositParams {
        uint256 networkTokenDeltaAmount;
        uint256 baseTokenDeltaAmount;
        uint256 baseTokenExcessLiquidity;
        bool useInitialRate;
    }

    // represents `(n1 - n2) / (d1 - d2)`
    struct Quotient {
        uint256 n1;
        uint256 n2;
        uint256 d1;
        uint256 d2;
    }

    // trading-related preprocessed data
    struct TradingParams {
        uint256 sourceBalance;
        uint256 targetBalance;
        PoolLiquidity liquidity;
        IReserveToken pool;
        bool isSourceNetworkToken;
        uint32 tradingFeePPM;
    }

    // the network contract
    IBancorNetwork private immutable _network;

    // the address of the network token
    IERC20 private immutable _networkToken;

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the pool token factory contract
    IPoolTokenFactory private immutable _poolTokenFactory;

    // a mapping between reserve tokens and their pools
    mapping(IReserveToken => Pool) internal _poolData;

    // the set of all pools which are managed by this pool collection
    EnumerableSetUpgradeable.AddressSet private _pools;

    // the default trading fee (in units of PPM)
    uint32 private _defaultTradingFeePPM;

    /**
     * @dev triggered when a pool is created
     */
    event PoolCreated(IPoolToken indexed poolToken, IReserveToken indexed reserveToken);

    /**
     * @dev triggered when the default trading fee is updated
     */
    event DefaultTradingFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when a specific pool's trading fee is updated
     */
    event TradingFeePPMUpdated(IReserveToken indexed pool, uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when trading in a specific pool is enabled/disabled
     */
    event TradingEnabled(IReserveToken indexed pool, bool newStatus, uint8 reason);

    /**
     * @dev triggered when depositing to a specific pool is enabled/disabled
     */
    event DepositingEnabled(IReserveToken indexed pool, bool newStatus);

    /**
     * @dev triggered when a pool's initial rate is updated
     */
    event InitialRateUpdated(IReserveToken indexed pool, Fraction prevRate, Fraction newRate);

    /**
     * @dev triggered when a pool's deposit limit is updated
     */
    event DepositLimitUpdated(IReserveToken indexed pool, uint256 prevDepositLimit, uint256 newDepositLimit);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IBancorNetwork initNetwork, IPoolTokenFactory initPoolTokenFactory)
        validAddress(address(initNetwork))
        validAddress(address(initPoolTokenFactory))
    {
        __ReentrancyGuard_init();

        _network = initNetwork;
        _networkToken = initNetwork.networkToken();
        _settings = initNetwork.settings();
        _poolTokenFactory = initPoolTokenFactory;

        _setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
    }

    modifier validRate(Fraction memory rate) {
        _validRate(rate);

        _;
    }

    function _validRate(Fraction memory rate) internal pure {
        require(_isFractionValid(rate), "ERR_INVALID_RATE");
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure virtual override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolType() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function network() external view override returns (IBancorNetwork) {
        return _network;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function networkToken() external view override returns (IERC20) {
        return _networkToken;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function settings() external view override returns (INetworkSettings) {
        return _settings;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolTokenFactory() external view override returns (IPoolTokenFactory) {
        return _poolTokenFactory;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function defaultTradingFeePPM() external view override returns (uint32) {
        return _defaultTradingFeePPM;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function pools() external view override returns (IReserveToken[] memory) {
        uint256 length = _pools.length();
        IReserveToken[] memory list = new IReserveToken[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = IReserveToken(_pools.at(i));
        }
        return list;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolCount() external view override returns (uint256) {
        return _pools.length();
    }

    /**
     * @dev sets the default trading fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setDefaultTradingFeePPM(uint32 newDefaultTradingFeePPM)
        external
        onlyOwner
        validFee(newDefaultTradingFeePPM)
    {
        _setDefaultTradingFeePPM(newDefaultTradingFeePPM);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function createPool(IReserveToken reserveToken) external override only(address(_network)) nonReentrant {
        require(_settings.isTokenWhitelisted(reserveToken), "ERR_TOKEN_NOT_WHITELISTED");
        require(_pools.add(address(reserveToken)), "ERR_POOL_ALREADY_EXISTS");

        IPoolToken newPoolToken = IPoolToken(_poolTokenFactory.createPoolToken(reserveToken));

        newPoolToken.acceptOwnership();

        Pool memory newPool = Pool({
            poolToken: newPoolToken,
            tradingFeePPM: _defaultTradingFeePPM,
            tradingEnabled: true,
            depositingEnabled: true,
            averageRate: AverageRate({ time: 0, rate: _zeroFraction() }),
            initialRate: _zeroFraction(),
            depositLimit: 0,
            liquidity: PoolLiquidity({
                networkTokenTradingLiquidity: 0,
                baseTokenTradingLiquidity: 0,
                tradingLiquidityProduct: 0,
                stakedBalance: 0
            })
        });

        _poolData[reserveToken] = newPool;

        emit PoolCreated({ poolToken: newPoolToken, reserveToken: reserveToken });

        // although the owner-controlled flag is set to true, we want to emphasize that the trading in a newly created
        // pool is disabled
        emit TradingEnabled({ pool: reserveToken, newStatus: false, reason: TRADING_STATUS_UPDATE_OWNER });

        emit TradingFeePPMUpdated({ pool: reserveToken, prevFeePPM: 0, newFeePPM: newPool.tradingFeePPM });
        emit DepositingEnabled({ pool: reserveToken, newStatus: newPool.depositingEnabled });
        emit InitialRateUpdated({
            pool: reserveToken,
            prevRate: Fraction({ n: 0, d: 0 }),
            newRate: newPool.initialRate
        });
        emit DepositLimitUpdated({ pool: reserveToken, prevDepositLimit: 0, newDepositLimit: newPool.depositLimit });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function isPoolValid(IReserveToken reserveToken) external view override returns (bool) {
        return _validPool(_poolData[reserveToken]);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function isPoolRateStable(IReserveToken reserveToken) external view override returns (bool) {
        Pool memory pool = _poolData[reserveToken];
        if (!_validPool(pool)) {
            return false;
        }

        // verify that the average rate of the pool isn't deviated too much from its spot rate
        return
            PoolAverageRate.isPoolRateStable(
                Fraction({
                    n: pool.liquidity.networkTokenTradingLiquidity,
                    d: pool.liquidity.baseTokenTradingLiquidity
                }),
                pool.averageRate,
                _settings.averageRateMaxDeviationPPM()
            );
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolLiquidity(IReserveToken reserveToken) external view override returns (PoolLiquidity memory) {
        return _poolData[reserveToken].liquidity;
    }

    /**
     * @dev sets the trading fee of a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setTradingFeePPM(IReserveToken pool, uint32 newTradingFeePPM)
        external
        onlyOwner
        validFee(newTradingFeePPM)
    {
        Pool storage poolData = _poolStorage(pool);

        uint32 prevTradingFeePPM = poolData.tradingFeePPM;
        if (prevTradingFeePPM == newTradingFeePPM) {
            return;
        }

        poolData.tradingFeePPM = newTradingFeePPM;

        emit TradingFeePPMUpdated({ pool: pool, prevFeePPM: prevTradingFeePPM, newFeePPM: newTradingFeePPM });
    }

    /**
     * @dev enables/disables trading in a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableTrading(IReserveToken pool, bool status) external onlyOwner {
        Pool storage poolData = _poolStorage(pool);

        if (poolData.tradingEnabled == status) {
            return;
        }

        poolData.tradingEnabled = status;

        emit TradingEnabled({ pool: pool, newStatus: status, reason: TRADING_STATUS_UPDATE_OWNER });
    }

    /**
     * @dev enables/disables depositing to a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableDepositing(IReserveToken pool, bool status) external onlyOwner {
        Pool storage poolData = _poolStorage(pool);

        if (poolData.depositingEnabled == status) {
            return;
        }

        poolData.depositingEnabled = status;

        emit DepositingEnabled({ pool: pool, newStatus: status });
    }

    /**
     * @dev sets the initial rate of a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setInitialRate(IReserveToken pool, Fraction memory newInitialRate)
        external
        onlyOwner
        validRate(newInitialRate)
    {
        Pool storage poolData = _poolStorage(pool);

        Fraction memory prevInitialRate = poolData.initialRate;
        if (prevInitialRate.n == newInitialRate.n && prevInitialRate.d == newInitialRate.d) {
            return;
        }

        poolData.initialRate = newInitialRate;

        emit InitialRateUpdated({ pool: pool, prevRate: prevInitialRate, newRate: newInitialRate });
    }

    /**
     * @dev sets the deposit limit of a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setDepositLimit(IReserveToken pool, uint256 newDepositLimit) external onlyOwner {
        Pool storage poolData = _poolStorage(pool);

        uint256 prevDepositLimit = poolData.depositLimit;
        if (prevDepositLimit == newDepositLimit) {
            return;
        }

        poolData.depositLimit = newDepositLimit;

        emit DepositLimitUpdated({ pool: pool, prevDepositLimit: prevDepositLimit, newDepositLimit: newDepositLimit });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function depositFor(
        address provider,
        IReserveToken pool,
        uint256 baseTokenAmount,
        uint256 unallocatedNetworkTokenLiquidity
    )
        external
        override
        only(address(_network))
        validAddress(provider)
        validAddress(address(pool))
        greaterThanZero(baseTokenAmount)
        nonReentrant
        returns (DepositAmounts memory)
    {
        PoolDepositParams memory depositParams = _poolDepositParams(
            pool,
            baseTokenAmount,
            unallocatedNetworkTokenLiquidity
        );

        Pool memory poolData = _poolData[pool];

        if (depositParams.useInitialRate) {
            // if we're using the initial rate, ensure that the average rate is set
            if (
                poolData.averageRate.rate.n != poolData.initialRate.n ||
                poolData.averageRate.rate.d != poolData.initialRate.d
            ) {
                poolData.averageRate.rate = poolData.initialRate;
            }
        } else {
            // otherwise, ensure that the initial rate is properly reset
            poolData.initialRate = _zeroFraction();
        }

        // if we've passed above the minimum network token liquidity for trading - emit that trading is now enabled
        if (poolData.tradingEnabled) {
            uint256 minLiquidityForTrading = _settings.minLiquidityForTrading();
            if (
                poolData.liquidity.networkTokenTradingLiquidity < minLiquidityForTrading &&
                poolData.liquidity.networkTokenTradingLiquidity.add(depositParams.baseTokenDeltaAmount) >=
                minLiquidityForTrading
            ) {
                emit TradingEnabled({ pool: pool, newStatus: true, reason: TRADING_STATUS_UPDATE_MIN_LIQUIDITY });
            }
        }

        // calculate and update the new trading liquidity based on the provided network token amount
        poolData.liquidity.networkTokenTradingLiquidity = poolData.liquidity.networkTokenTradingLiquidity.add(
            depositParams.networkTokenDeltaAmount
        );
        poolData.liquidity.baseTokenTradingLiquidity = poolData.liquidity.baseTokenTradingLiquidity.add(
            depositParams.baseTokenDeltaAmount
        );
        poolData.liquidity.tradingLiquidityProduct = poolData.liquidity.networkTokenTradingLiquidity.mul(
            poolData.liquidity.baseTokenTradingLiquidity
        );

        // calculate the pool token amount to mint
        IPoolToken poolToken = poolData.poolToken;
        uint256 currentStakedBalance = poolData.liquidity.stakedBalance;
        uint256 poolTokenAmount = _calcPoolTokenAmount(poolToken, baseTokenAmount, currentStakedBalance);

        // update the staked balance with the full base token amount
        poolData.liquidity.stakedBalance = currentStakedBalance.add(baseTokenAmount);

        _poolData[pool] = poolData;

        // mint pool tokens to the provider
        poolToken.mint(provider, poolTokenAmount);

        return
            DepositAmounts({
                networkTokenDeltaAmount: depositParams.networkTokenDeltaAmount,
                baseTokenDeltaAmount: depositParams.baseTokenDeltaAmount,
                poolTokenAmount: poolTokenAmount,
                poolToken: poolToken
            });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function withdraw(
        IReserveToken pool,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 externalProtectionWalletBalance
    )
        external
        override
        only(address(_network))
        validAddress(address(pool))
        greaterThanZero(basePoolTokenAmount)
        nonReentrant
        returns (WithdrawalAmounts memory amounts)
    {
        // obtain all withdrawal-related amounts
        amounts = _poolWithdrawalAmounts(
            pool,
            basePoolTokenAmount,
            baseTokenVaultBalance,
            externalProtectionWalletBalance
        );

        // execute post-withdrawal actions
        _postWithdrawal(
            pool,
            basePoolTokenAmount,
            amounts.baseTokenAmountToDeductFromLiquidity,
            amounts.networkTokenAmountToDeductFromLiquidity
        );
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function trade(
        IReserveToken sourcePool,
        IReserveToken targetPool,
        uint256 sourceAmount,
        uint256 minReturnAmount
    )
        external
        override
        only(address(_network))
        validAddress(address(sourcePool))
        validAddress(address(targetPool))
        greaterThanZero(sourceAmount)
        greaterThanZero(minReturnAmount)
        returns (TradeAmounts memory)
    {
        TradingParams memory params = _tradeParams(sourcePool, targetPool);

        TradeAmounts memory tradeAmounts = _targetAmountAndFee(
            params.sourceBalance,
            params.targetBalance,
            params.tradingFeePPM,
            sourceAmount
        );

        // ensure that the trade gives something in return
        require(tradeAmounts.amount != 0, "ERR_ZERO_TARGET_AMOUNT");
        require(tradeAmounts.amount >= minReturnAmount, "ERR_RETURN_TOO_LOW");

        Pool storage poolData = _poolData[params.pool];

        // update the recent average rate
        AverageRate memory currentAverageRate = poolData.averageRate;
        AverageRate memory newAverageRate = PoolAverageRate.calcAverageRate(
            Fraction({
                n: params.liquidity.networkTokenTradingLiquidity,
                d: params.liquidity.baseTokenTradingLiquidity
            }),
            currentAverageRate,
            _time()
        );

        if (
            newAverageRate.time != currentAverageRate.time ||
            !PoolAverageRate.isEqual(newAverageRate, currentAverageRate)
        ) {
            poolData.averageRate = newAverageRate;
        }

        // sync the reserve balances
        uint256 newNetworkTokenTradingLiquidity;
        uint256 newBaseTokenTradingLiquidity;
        if (params.isSourceNetworkToken) {
            newNetworkTokenTradingLiquidity = params.sourceBalance.add(sourceAmount);
            newBaseTokenTradingLiquidity = params.targetBalance.sub(tradeAmounts.amount);

            // if the target token is a base token, make sure add the fee to the staked balance
            poolData.liquidity.stakedBalance = params.liquidity.stakedBalance.add(tradeAmounts.feeAmount);
        } else {
            newBaseTokenTradingLiquidity = params.sourceBalance.add(sourceAmount);
            newNetworkTokenTradingLiquidity = params.targetBalance.sub(tradeAmounts.amount);
        }

        poolData.liquidity.networkTokenTradingLiquidity = newNetworkTokenTradingLiquidity;
        poolData.liquidity.baseTokenTradingLiquidity = newBaseTokenTradingLiquidity;
        poolData.liquidity.tradingLiquidityProduct = newNetworkTokenTradingLiquidity.mul(newBaseTokenTradingLiquidity);

        return tradeAmounts;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function targetAmountAndFee(
        IReserveToken sourcePool,
        IReserveToken targetPool,
        uint256 sourceAmount
    )
        external
        view
        override
        validAddress(address(sourcePool))
        validAddress(address(targetPool))
        greaterThanZero(sourceAmount)
        returns (TradeAmounts memory)
    {
        TradingParams memory params = _tradeParams(sourcePool, targetPool);

        return _targetAmountAndFee(params.sourceBalance, params.targetBalance, params.tradingFeePPM, sourceAmount);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function sourceAmountAndFee(
        IReserveToken sourcePool,
        IReserveToken targetPool,
        uint256 targetAmount
    )
        external
        view
        override
        validAddress(address(sourcePool))
        validAddress(address(targetPool))
        greaterThanZero(targetAmount)
        returns (TradeAmounts memory)
    {
        TradingParams memory params = _tradeParams(sourcePool, targetPool);

        return _sourceAmountAndFee(params.sourceBalance, params.targetBalance, params.tradingFeePPM, targetAmount);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function onFeesCollected(IReserveToken pool, uint256 baseTokenAmount)
        external
        override
        only(address(_network))
        validAddress(address(pool))
    {
        if (baseTokenAmount == 0) {
            return;
        }

        Pool storage poolData = _poolStorage(pool);

        // increase the staked balance by the given amount
        poolData.liquidity.stakedBalance = poolData.liquidity.stakedBalance.add(baseTokenAmount);
    }

    /**
     * @dev returns deposit-related output data
     */
    function _poolDepositParams(
        IReserveToken pool,
        uint256 baseTokenAmount,
        uint256 unallocatedNetworkTokenLiquidity
    ) private view returns (PoolDepositParams memory depositParams) {
        Pool memory poolData = _poolData[pool];
        require(_validPool(poolData), "ERR_POOL_DOES_NOT_EXIST");

        // get the effective rate to use when calculating the matching network token trading liquidity amount
        uint256 minLiquidityForTrading = _settings.minLiquidityForTrading();
        require(minLiquidityForTrading > 0, "ERR_MIN_LIQUIDITY_NOT_SET");

        // verify that the staked balance and the newly deposited amount isn’t higher than the deposit limit
        require(
            poolData.liquidity.stakedBalance.add(baseTokenAmount) <= poolData.depositLimit,
            "ERR_DEPOSIT_LIMIT_EXCEEDED"
        );

        Fraction memory rate;
        depositParams.useInitialRate = poolData.liquidity.networkTokenTradingLiquidity < minLiquidityForTrading;
        if (depositParams.useInitialRate) {
            // if the minimum network token trading liquidity isn't met - use the initial rate (but ensure that it was
            // actually set)
            require(_isFractionValid(poolData.initialRate), "ERR_NO_INITIAL_RATE");

            rate = poolData.initialRate;
        } else {
            // if the minimum network token trading liquidity is met - use the average rate
            rate = poolData.averageRate.rate;
        }

        // if all network token liquidity is allocated - treat all the base token amount as excess and finish
        if (unallocatedNetworkTokenLiquidity == 0) {
            depositParams.baseTokenExcessLiquidity = baseTokenAmount;
            depositParams.baseTokenDeltaAmount = 0;

            return depositParams;
        }

        // calculate the matching network token trading liquidity amount
        depositParams.networkTokenDeltaAmount = MathEx.mulDivF(baseTokenAmount, rate.n, rate.d);

        // if most of network token liquidity is allocated - we'll use as much as we can and the remaining base token
        // liquidity will be treated as excess
        if (depositParams.networkTokenDeltaAmount > unallocatedNetworkTokenLiquidity) {
            uint256 unavailableNetworkTokenAmount = depositParams.networkTokenDeltaAmount -
                unallocatedNetworkTokenLiquidity;

            depositParams.networkTokenDeltaAmount = unallocatedNetworkTokenLiquidity;
            depositParams.baseTokenExcessLiquidity = MathEx.mulDivF(unavailableNetworkTokenAmount, rate.d, rate.n);
        }

        // base token amount is guaranteed to be larger than the excess liquidity
        depositParams.baseTokenDeltaAmount = baseTokenAmount - depositParams.baseTokenExcessLiquidity;
    }

    /**
     * @dev returns withdrawal amounts
     */
    function _poolWithdrawalAmounts(
        IReserveToken pool,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 externalProtectionWalletBalance
    ) internal view returns (WithdrawalAmounts memory amounts) {
        PoolWithdrawalParams memory params = _poolWithdrawalParams(pool);

        return
            _withdrawalAmounts(
                params.networkTokenAvgTradingLiquidity,
                params.baseTokenAvgTradingLiquidity,
                MathEx.subMax0(baseTokenVaultBalance, params.baseTokenTradingLiquidity),
                params.basePoolTokenTotalSupply,
                params.baseTokenStakedAmount,
                externalProtectionWalletBalance,
                params.tradeFeePPM,
                _settings.withdrawalFeePPM(),
                basePoolTokenAmount
            );
    }

    /**
     * @dev returns withdrawal-related input which can be retrieved from the pool
     */
    function _poolWithdrawalParams(IReserveToken pool) private view returns (PoolWithdrawalParams memory) {
        Pool memory poolData = _poolData[pool];
        require(_validPool(poolData), "ERR_POOL_DOES_NOT_EXIST");

        uint256 prod = poolData.liquidity.networkTokenTradingLiquidity.mul(
            poolData.liquidity.baseTokenTradingLiquidity
        );

        return
            PoolWithdrawalParams({
                networkTokenAvgTradingLiquidity: MathEx.floorSqrt(
                    MathEx.mulDivF(prod, poolData.averageRate.rate.n, poolData.averageRate.rate.d)
                ),
                baseTokenAvgTradingLiquidity: MathEx.floorSqrt(
                    MathEx.mulDivF(prod, poolData.averageRate.rate.d, poolData.averageRate.rate.n)
                ),
                baseTokenTradingLiquidity: poolData.liquidity.baseTokenTradingLiquidity,
                basePoolTokenTotalSupply: poolData.poolToken.totalSupply(),
                baseTokenStakedAmount: poolData.liquidity.stakedBalance,
                tradeFeePPM: poolData.tradingFeePPM
            });
    }

    /**
     * @dev executes post-withdrawal actions:
     *
     * - burns the network's base pool tokens
     * - updates the pool's base token staked balance
     * - updates the pool's base token trading liquidity
     * - updates the pool's network token trading liquidity
     * - updates the pool's trading liquidity product
     * - emits an event if the pool's network token trading liquidity has crossed the minimum threshold (either above it
     * or below it)
     */
    function _postWithdrawal(
        IReserveToken pool,
        uint256 basePoolTokenAmount,
        uint256 baseTokenTradingLiquidityDelta,
        uint256 networkTokenTradingLiquidityDelta
    ) private {
        Pool storage poolData = _poolData[pool];
        uint256 totalSupply = poolData.poolToken.totalSupply();

        // all of these are at most MAX_UINT128, but we store them as uint256 in order to avoid 128-bit multiplication
        // overflows
        uint256 baseTokenCurrTradingLiquidity = poolData.liquidity.baseTokenTradingLiquidity;
        uint256 networkTokenCurrTradingLiquidity = poolData.liquidity.networkTokenTradingLiquidity;
        uint256 baseTokenNewTradingLiquidity = baseTokenCurrTradingLiquidity.sub(baseTokenTradingLiquidityDelta);
        uint256 networkTokenNewTradingLiquidity = networkTokenCurrTradingLiquidity.sub(
            networkTokenTradingLiquidityDelta
        );

        poolData.poolToken.burnFrom(address(_network), basePoolTokenAmount);
        poolData.liquidity.stakedBalance = MathEx.mulDivF(
            poolData.liquidity.stakedBalance,
            totalSupply - basePoolTokenAmount,
            totalSupply
        );
        poolData.liquidity.baseTokenTradingLiquidity = baseTokenNewTradingLiquidity;
        poolData.liquidity.networkTokenTradingLiquidity = networkTokenNewTradingLiquidity;
        poolData.liquidity.tradingLiquidityProduct = baseTokenNewTradingLiquidity.mul(networkTokenNewTradingLiquidity);

        // ensure that the average rate is reset when the pool is being emptied
        if (baseTokenNewTradingLiquidity == 0) {
            poolData.averageRate.rate = _zeroFraction();
        }

        if (poolData.tradingEnabled) {
            uint256 minLiquidityForTrading = _settings.minLiquidityForTrading();
            bool currEnabled = networkTokenCurrTradingLiquidity >= minLiquidityForTrading;
            bool newEnabled = networkTokenNewTradingLiquidity >= minLiquidityForTrading;
            if (newEnabled != currEnabled) {
                emit TradingEnabled({ pool: pool, newStatus: newEnabled, reason: TRADING_STATUS_UPDATE_MIN_LIQUIDITY });
            }
        }
    }

    /**
     * @dev returns all amounts related to base token withdrawal, where each amount includes the withdrawal fee, which
     * may need to be deducted (depending on usage)
     */
    function _withdrawalAmounts(
        uint256 networkTokenLiquidity,
        uint256 baseTokenLiquidity,
        uint256 baseTokenExcessAmount,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenStakedAmount,
        uint256 baseTokenExternalProtectionWalletBalance,
        uint256 tradeFeePPM,
        uint256 withdrawalFeePPM,
        uint256 basePoolTokenWithdrawalAmount
    ) internal pure returns (WithdrawalAmounts memory amounts) {
        uint256 baseTokenVaultBalance = baseTokenLiquidity.add(baseTokenExcessAmount);

        if (baseTokenStakedAmount > baseTokenVaultBalance) {
            uint256 baseTokenOffsetAmount = _deductFee(
                baseTokenStakedAmount - baseTokenVaultBalance,
                basePoolTokenWithdrawalAmount,
                basePoolTokenTotalSupply,
                withdrawalFeePPM
            );

            amounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider = baseTokenOffsetAmount <
                baseTokenExternalProtectionWalletBalance
                ? baseTokenOffsetAmount
                : baseTokenExternalProtectionWalletBalance;

            (basePoolTokenWithdrawalAmount, basePoolTokenTotalSupply, baseTokenStakedAmount) = _reviseInput(
                amounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
                basePoolTokenWithdrawalAmount,
                basePoolTokenTotalSupply,
                baseTokenStakedAmount,
                withdrawalFeePPM
            );
        }

        uint256 baseTokenShare = baseTokenStakedAmount.mul(basePoolTokenWithdrawalAmount);

        amounts.baseTokenAmountToTransferFromVaultToProvider = _deductFee(
            1,
            baseTokenShare,
            basePoolTokenTotalSupply,
            withdrawalFeePPM
        );

        amounts.baseTokenAmountToDeductFromLiquidity = _deductFee(
            baseTokenLiquidity,
            baseTokenShare,
            basePoolTokenTotalSupply.mul(baseTokenVaultBalance),
            withdrawalFeePPM
        );

        amounts.networkTokenAmountToDeductFromLiquidity = _deductFee(
            networkTokenLiquidity,
            baseTokenShare,
            basePoolTokenTotalSupply.mul(baseTokenVaultBalance),
            0
        );

        if (baseTokenVaultBalance >= baseTokenStakedAmount) {
            // the pool is not in a base token deficit
            uint256 baseTokenOffsetAmount = _deductFee(
                baseTokenVaultBalance - baseTokenStakedAmount,
                basePoolTokenWithdrawalAmount,
                basePoolTokenTotalSupply,
                withdrawalFeePPM
            );

            uint256 networkTokenArbitrageAmount = _posArbitrage(
                MathEx.subMax0(networkTokenLiquidity, amounts.networkTokenAmountToDeductFromLiquidity),
                MathEx.subMax0(baseTokenLiquidity, amounts.baseTokenAmountToDeductFromLiquidity),
                basePoolTokenTotalSupply,
                baseTokenOffsetAmount,
                tradeFeePPM,
                withdrawalFeePPM,
                baseTokenShare
            );

            if (
                networkTokenArbitrageAmount.add(amounts.networkTokenAmountToDeductFromLiquidity) <=
                networkTokenLiquidity
            ) {
                amounts.networkTokenArbitrageAmount = -networkTokenArbitrageAmount.toInt256();
            }
        } else {
            // the pool is in a base token deficit
            if (amounts.baseTokenAmountToTransferFromVaultToProvider <= baseTokenVaultBalance) {
                uint256 baseTokenOffsetAmount = _deductFee(
                    baseTokenStakedAmount - baseTokenVaultBalance,
                    basePoolTokenWithdrawalAmount,
                    basePoolTokenTotalSupply,
                    withdrawalFeePPM
                );

                amounts.networkTokenArbitrageAmount = _negArbitrage(
                    MathEx.subMax0(networkTokenLiquidity, amounts.networkTokenAmountToDeductFromLiquidity),
                    MathEx.subMax0(baseTokenLiquidity, amounts.baseTokenAmountToDeductFromLiquidity),
                    basePoolTokenTotalSupply,
                    baseTokenOffsetAmount,
                    tradeFeePPM,
                    withdrawalFeePPM,
                    baseTokenShare
                ).toInt256();
            }

            if (amounts.networkTokenArbitrageAmount == 0) {
                // the withdrawal amount is larger than the vault's balance
                uint256 aMx = networkTokenLiquidity.mul(basePoolTokenWithdrawalAmount);
                uint256 bMd = baseTokenLiquidity.mul(basePoolTokenTotalSupply);

                amounts.networkTokenAmountToMintForProvider = _deductFee(
                    baseTokenStakedAmount - baseTokenVaultBalance,
                    aMx,
                    bMd,
                    withdrawalFeePPM
                );

                amounts.baseTokenAmountToTransferFromVaultToProvider = _deductFee(
                    baseTokenVaultBalance,
                    basePoolTokenWithdrawalAmount,
                    basePoolTokenTotalSupply,
                    withdrawalFeePPM
                );

                amounts.baseTokenAmountToDeductFromLiquidity = _deductFee(
                    baseTokenLiquidity,
                    basePoolTokenWithdrawalAmount,
                    basePoolTokenTotalSupply,
                    withdrawalFeePPM
                );

                amounts.networkTokenAmountToDeductFromLiquidity = _deductFee(
                    networkTokenLiquidity,
                    basePoolTokenWithdrawalAmount,
                    basePoolTokenTotalSupply,
                    0
                );
            }
        }

        // TODO: withdrawal fee
        amounts.baseTokenWithdrawalFeeAmount = 0;
    }

    /**
     * @dev returns `xy * (1 - n) / z`, assuming `n` is normalized
     */
    function _deductFee(
        uint256 x,
        uint256 y,
        uint256 z,
        uint256 n
    ) internal pure returns (uint256) {
        return MathEx.mulDivF(x, y.mul(PPM_RESOLUTION - n), z.mul(PPM_RESOLUTION));
    }

    /**
     * @dev recalculates the values of `x`, `d` and `e`
     *
     * let the following denote the input:
     * E = base token amount to transfer from the external protection wallet to the provider
     * x = base pool token withdrawal amount
     * d = base pool token total supply
     * e = base token staked amount
     * n = withdrawal fee in ppm units
     *
     * output, assuming `n` is normalized:
     * x = x - E / (1 - n) * d / e
     * d = d - E / (1 - n) * d / e
     * e = e - E / (1 - n)
     */
    function _reviseInput(
        uint256 baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
        uint256 basePoolTokenWithdrawalAmount,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenStakedAmount,
        uint256 withdrawalFeePPM
    )
        internal
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFee = MathEx.mulDivF(
            baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
            PPM_RESOLUTION,
            PPM_RESOLUTION - withdrawalFeePPM
        );
        uint256 baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFeeMulRatio = MathEx.mulDivF(
            baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFee,
            basePoolTokenTotalSupply,
            baseTokenStakedAmount
        );
        return (
            basePoolTokenWithdrawalAmount.sub(
                baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFeeMulRatio
            ),
            basePoolTokenTotalSupply.sub(
                baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFeeMulRatio
            ),
            baseTokenStakedAmount.sub(baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFee)
        );
    }

    /**
     * @dev returns the amount of network tokens which should be removed from the pool in order to create an optimal
     * arbitrage incentive
     *
     * let the following denote the input:
     * a = network token hypothetical trading liquidity
     * b = base token hypothetical trading liquidity
     * d = base pool token total supply
     * e = base token staked amount
     * f = base token redundant amount
     * m = trade fee in ppm units
     * n = withdrawal fee in ppm units
     * x = base pool token withdrawal amount
     * ex = base token share
     *
     * output, assuming `m` and `n` are normalized:
     * if `f(f + bm - 2fm) / (b - fm) <  exn / d` return `af(b(2 - m) - f) / (b(b - fm))`
     * if `f(f + bm - 2fm) / (b - fm) >= exn / d` return `0`
     */
    function _posArbitrage(
        uint256 networkTokenLiquidity,
        uint256 baseTokenLiquidity,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenOffsetAmount,
        uint256 tradeFeePPM,
        uint256 withdrawalFeePPM,
        uint256 baseTokenShare
    ) internal pure returns (uint256) {
        return
            _calcArbitrage(
                networkTokenLiquidity,
                baseTokenLiquidity,
                basePoolTokenTotalSupply,
                baseTokenOffsetAmount,
                withdrawalFeePPM,
                baseTokenShare,
                _posArbitrage(baseTokenLiquidity, baseTokenOffsetAmount, tradeFeePPM)
            );
    }

    /**
     * @dev returns the amount of network tokens which should be added to the pool in order to create an optimal
     * arbitrage incentive
     *
     * let the following denote the input:
     * a = network token hypothetical trading liquidity
     * b = base token hypothetical trading liquidity
     * d = base pool token total supply
     * e = base token staked amount
     * f = base token required amount
     * m = trade fee in ppm units
     * n = withdrawal fee in ppm units
     * x = base pool token withdrawal amount
     * ex = base token share
     *
     * output, assuming `m` and `n` are normalized:
     * if `f(f - bm - 2fm) / (b + fm) <  exn / d` return `af(b(2 - m) + f) / (b(b + fm))`
     * if `f(f - bm - 2fm) / (b + fm) >= exn / d` return `0`
     */
    function _negArbitrage(
        uint256 networkTokenLiquidity,
        uint256 baseTokenLiquidity,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenOffsetAmount,
        uint256 tradeFeePPM,
        uint256 withdrawalFeePPM,
        uint256 baseTokenShare
    ) internal pure returns (uint256) {
        return
            _calcArbitrage(
                networkTokenLiquidity,
                baseTokenLiquidity,
                basePoolTokenTotalSupply,
                baseTokenOffsetAmount,
                withdrawalFeePPM,
                baseTokenShare,
                _negArbitrage(baseTokenLiquidity, baseTokenOffsetAmount, tradeFeePPM)
            );
    }

    /**
     * @dev returns a pair of quotients
     *
     * let the following denote the input:
     * b = base token hypothetical trading liquidity
     * f = base token redundant amount
     * m = trade fee in ppm units
     *
     * output, assuming `m` is normalized:
     * 1. `(f + bm - 2fm) / (b - fm)`
     * 2. `(2b - bm - f) / (b - fm)`
     */
    function _posArbitrage(
        uint256 baseTokenLiquidity,
        uint256 baseTokenOffsetAmount,
        uint256 tradeFeePPM
    ) internal pure returns (Quotient[2] memory) {
        uint256 bm = baseTokenLiquidity.mul(tradeFeePPM);
        uint256 fm = baseTokenOffsetAmount.mul(tradeFeePPM);
        uint256 bM = baseTokenLiquidity.mul(PPM_RESOLUTION);
        uint256 fM = baseTokenOffsetAmount.mul(PPM_RESOLUTION);
        return [
            Quotient({ n1: fM.add(bm), n2: fm.mul(2), d1: bM, d2: fm }),
            Quotient({ n1: baseTokenLiquidity.mul(2 * PPM_RESOLUTION - tradeFeePPM), n2: fM, d1: bM, d2: fm })
        ];
    }

    /**
     * @dev returns a pair of quotients
     *
     * let the following denote the input:
     * b = base token hypothetical trading liquidity
     * f = base token required amount
     * m = trade fee in ppm units
     *
     * output, assuming `m` is normalized:
     * 1. `(f - bm - 2fm) / (b + fm)`
     * 2. `(2b - bm + f) / (b + fm)`
     */
    function _negArbitrage(
        uint256 baseTokenLiquidity,
        uint256 baseTokenOffsetAmount,
        uint256 tradeFeePPM
    ) internal pure returns (Quotient[2] memory) {
        uint256 bm = baseTokenLiquidity.mul(tradeFeePPM);
        uint256 fm = baseTokenOffsetAmount.mul(tradeFeePPM);
        uint256 bM = baseTokenLiquidity.mul(PPM_RESOLUTION);
        uint256 fM = baseTokenOffsetAmount.mul(PPM_RESOLUTION);
        return [
            Quotient({ n1: fM, n2: bm.add(fm.mul(2)), d1: bM.add(fm), d2: 0 }),
            Quotient({
                n1: baseTokenLiquidity.mul(2 * PPM_RESOLUTION - tradeFeePPM).add(fM),
                n2: 0,
                d1: bM.add(fm),
                d2: 0
            })
        ];
    }

    /**
     * @dev returns the arbitrage if it is smaller than the fee paid, and 0 otherwise
     */
    function _calcArbitrage(
        uint256 networkTokenLiquidity,
        uint256 baseTokenLiquidity,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenOffsetAmount,
        uint256 withdrawalFeePPM,
        uint256 baseTokenShare,
        Quotient[2] memory quotients
    ) internal pure returns (uint256) {
        Fraction memory y = _subMax0(quotients[0]);

        if (
            MathEx.mulDivF(baseTokenOffsetAmount, y.n, y.d) <
            MathEx.mulDivF(baseTokenShare, withdrawalFeePPM, basePoolTokenTotalSupply.mul(PPM_RESOLUTION))
        ) {
            Fraction memory z = _subMax0(quotients[1]);
            return MathEx.mulDivF(networkTokenLiquidity.mul(baseTokenOffsetAmount), z.n, baseTokenLiquidity.mul(z.d));
        }
        return 0;
    }

    /**
     * @dev returns the maximum of `(q.n1 - q.n2) / (q.d1 - q.d2)` and 0
     */
    function _subMax0(Quotient memory q) internal pure returns (Fraction memory) {
        if (q.n1 > q.n2 && q.d1 > q.d2) {
            // the quotient is finite and positive
            return Fraction({ n: q.n1 - q.n2, d: q.d1 - q.d2 });
        }

        if (q.n2 > q.n1 && q.d2 > q.d1) {
            // the quotient is finite and positive
            return Fraction({ n: q.n2 - q.n1, d: q.d2 - q.d1 });
        }

        if (q.n2 == q.n1 && q.d2 == q.d1) {
            // the quotient is 1
            return Fraction({ n: 1, d: 1 });
        }

        // the quotient is not finite or not positive
        return Fraction({ n: 0, d: q.d1 == q.d2 ? 0 : 1 });
    }

    /**
     * @dev sets the default trading fee (in units of PPM)
     */
    function _setDefaultTradingFeePPM(uint32 newDefaultTradingFeePPM) private {
        uint32 prevDefaultTradingFeePPM = _defaultTradingFeePPM;
        if (prevDefaultTradingFeePPM == newDefaultTradingFeePPM) {
            return;
        }

        _defaultTradingFeePPM = newDefaultTradingFeePPM;

        emit DefaultTradingFeePPMUpdated({ prevFeePPM: prevDefaultTradingFeePPM, newFeePPM: newDefaultTradingFeePPM });
    }

    /**
     * @dev returns a storage reference to pool data
     */
    function _poolStorage(IReserveToken pool) private view returns (Pool storage) {
        Pool storage poolData = _poolData[pool];
        require(_validPool(poolData), "ERR_POOL_DOES_NOT_EXIST");

        return poolData;
    }

    /**
     * @dev returns whether a pool is valid
     */
    function _validPool(Pool memory pool) private pure returns (bool) {
        return address(pool.poolToken) != address(0x0);
    }

    /**
     * @dev returns the zero fraction
     */
    function _zeroFraction() private pure returns (Fraction memory) {
        return Fraction({ n: 0, d: 1 });
    }

    /**
     * @dev returns whether a fraction is zero
     */
    function _isFractionValid(Fraction memory fraction) private pure returns (bool) {
        return fraction.n != 0 && fraction.d != 0;
    }

    /**
     * @dev calculates pool tokens amount
     */
    function _calcPoolTokenAmount(
        IPoolToken poolToken,
        uint256 baseTokenAmount,
        uint256 stakedBalance
    ) private view returns (uint256) {
        uint256 poolTokenTotalSupply = poolToken.totalSupply();
        if (poolTokenTotalSupply == 0) {
            // if this is the initial liquidity provision - use a one-to-one pool token to base token rate
            require(stakedBalance == 0, "ERR_INVALID_STAKED_BALANCE");

            return baseTokenAmount;
        }

        return MathEx.mulDivF(baseTokenAmount, poolTokenTotalSupply, stakedBalance);
    }

    /**
     * @dev returns trading params
     */
    function _tradeParams(IReserveToken sourcePool, IReserveToken targetPool)
        private
        view
        returns (TradingParams memory params)
    {
        // ensure that the network token is either the source or the target pool
        bool isSourceNetworkToken = address(sourcePool) == address(_networkToken);
        bool isTargetNetworkToken = address(targetPool) == address(_networkToken);
        if (isSourceNetworkToken && !isTargetNetworkToken) {
            params.isSourceNetworkToken = true;
            params.pool = targetPool;
        } else if (!isSourceNetworkToken && isTargetNetworkToken) {
            params.isSourceNetworkToken = false;
            params.pool = sourcePool;
        } else {
            // the network token isn't one of the pools or is both of them
            revert("ERR_INVALID_POOLS");
        }

        Pool memory poolData = _poolData[params.pool];
        require(_validPool(poolData), "ERR_POOL_DOES_NOT_EXIST");

        params.liquidity = poolData.liquidity;
        params.tradingFeePPM = poolData.tradingFeePPM;

        // verify that trading is enabled
        require(poolData.tradingEnabled, "ERR_TRADING_DISABLED");

        // verify that liquidity is above the minimum network token liquidity for trading
        require(
            params.liquidity.networkTokenTradingLiquidity >= _settings.minLiquidityForTrading(),
            "ERR_NETWORK_LIQUIDITY_TOO_LOW"
        );

        if (params.isSourceNetworkToken) {
            params.sourceBalance = params.liquidity.networkTokenTradingLiquidity;
            params.targetBalance = params.liquidity.baseTokenTradingLiquidity;
        } else {
            params.sourceBalance = params.liquidity.baseTokenTradingLiquidity;
            params.targetBalance = params.liquidity.networkTokenTradingLiquidity;
        }
    }

    /**
     * @dev returns the target amount and fee by specifying the source amount
     */
    function _targetAmountAndFee(
        uint256 sourceBalance,
        uint256 targetBalance,
        uint32 tradingFeePPM,
        uint256 sourceAmount
    ) private pure returns (TradeAmounts memory) {
        require(sourceBalance > 0 && targetBalance > 0, "ERR_INVALID_POOL_BALANCE");

        uint256 targetAmount = MathEx.mulDivF(targetBalance, sourceAmount, sourceBalance.add(sourceAmount));
        uint256 feeAmount = MathEx.mulDivF(targetAmount, tradingFeePPM, PPM_RESOLUTION);

        return TradeAmounts({ amount: targetAmount - feeAmount, feeAmount: feeAmount });
    }

    /**
     * @dev returns the source amount and fee by specifying the target amount
     */
    function _sourceAmountAndFee(
        uint256 sourceBalance,
        uint256 targetBalance,
        uint32 tradingFeePPM,
        uint256 targetAmount
    ) private pure returns (TradeAmounts memory) {
        require(sourceBalance > 0, "ERR_INVALID_POOL_BALANCE");

        uint256 feeAmount = MathEx.mulDivF(targetAmount, tradingFeePPM, PPM_RESOLUTION - tradingFeePPM);
        uint256 fullTargetAmount = targetAmount.add(feeAmount);
        require(fullTargetAmount < targetBalance, "ERR_INVALID_POOL_BALANCE");
        uint256 sourceAmount = MathEx.mulDivF(sourceBalance, fullTargetAmount, targetBalance - fullTargetAmount);

        return TradeAmounts({ amount: sourceAmount, feeAmount: feeAmount });
    }
}

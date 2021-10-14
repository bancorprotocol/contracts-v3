// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { Fraction } from "../utility/Types.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Owned } from "../utility/Owned.sol";
import { Time } from "../utility/Time.sol";
import { MathEx, uncheckedInc } from "../utility/MathEx.sol";

// prettier-ignore
import {
    Utils,
    AlreadyExists,
    DoesNotExist,
    InvalidPool,
    InvalidPoolBalance,
    InvalidPoolCollection,
    InvalidStakedBalance,
    NotWhitelisted
} from "../utility/Utils.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolTokenFactory } from "./interfaces/IPoolTokenFactory.sol";
import { IPoolCollectionUpgrader } from "./interfaces/IPoolCollectionUpgrader.sol";

// prettier-ignore
import {
    IPoolCollection,
    PoolLiquidity,
    Pool,
    DepositAmounts,
    WithdrawalAmounts,
    TradeAmountsWithLiquidity,
    TradeAmounts
} from "./interfaces/IPoolCollection.sol";

import { PoolAverageRate, AverageRate } from "./PoolAverageRate.sol";

error InvalidRate();
error ZeroTargetAmount();
error ReturnAmountTooLow();
error MinLiquidityNotSet();
error DepositLimitExceeded();
error NoInitialRate();
error TradingDisabled();
error LiquidityTooLow();

/**
 * @dev Pool Collection contract
 *
 * notes:
 *
 * - in Bancor V3, the address of reserve token serves as the pool unique ID in both contract functions and events
 */
contract PoolCollection is IPoolCollection, Owned, ReentrancyGuardUpgradeable, Time, Utils {
    using SafeCast for uint256;
    using ReserveTokenLibrary for ReserveToken;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    uint16 private constant POOL_TYPE = 1;
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
        uint32 tradeFeePPM;
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
        ReserveToken pool;
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

    // the pool collection upgrader contract
    IPoolCollectionUpgrader private immutable _poolCollectionUpgrader;

    // a mapping between reserve tokens and their pools
    mapping(ReserveToken => Pool) internal _poolData;

    // the set of all pools which are managed by this pool collection
    EnumerableSetUpgradeable.AddressSet private _pools;

    // the default trading fee (in units of PPM)
    uint32 private _defaultTradingFeePPM;

    /**
     * @dev triggered when a pool is created
     */
    event PoolCreated(IPoolToken indexed poolToken, ReserveToken indexed reserveToken);

    /**
     * @dev triggered when a pool is migrated
     */
    event PoolUpdated(ReserveToken indexed reserveToken);

    /**
     * @dev triggered when a pool is removed
     */
    event PoolRemoved(ReserveToken indexed reserveToken);

    /**
     * @dev triggered when the default trading fee is updated
     */
    event DefaultTradingFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when a specific pool's trading fee is updated
     */
    event TradingFeePPMUpdated(ReserveToken indexed pool, uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when trading in a specific pool is enabled/disabled
     */
    event TradingEnabled(ReserveToken indexed pool, bool newStatus, uint8 reason);

    /**
     * @dev triggered when depositing to a specific pool is enabled/disabled
     */
    event DepositingEnabled(ReserveToken indexed pool, bool newStatus);

    /**
     * @dev triggered when a pool's initial rate is updated
     */
    event InitialRateUpdated(ReserveToken indexed pool, Fraction prevRate, Fraction newRate);

    /**
     * @dev triggered when a pool's deposit limit is updated
     */
    event DepositLimitUpdated(ReserveToken indexed pool, uint256 prevDepositLimit, uint256 newDepositLimit);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        IPoolTokenFactory initPoolTokenFactory,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    )
        validAddress(address(initNetwork))
        validAddress(address(initPoolTokenFactory))
        validAddress(address(initPoolCollectionUpgrader))
    {
        __ReentrancyGuard_init();

        _network = initNetwork;
        _networkToken = initNetwork.networkToken();
        _settings = initNetwork.settings();
        _poolTokenFactory = initPoolTokenFactory;
        _poolCollectionUpgrader = initPoolCollectionUpgrader;

        _setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
    }

    modifier validRate(Fraction memory rate) {
        _validRate(rate);

        _;
    }

    function _validRate(Fraction memory rate) internal pure {
        if (!_isFractionValid(rate)) {
            revert InvalidRate();
        }
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external view virtual override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolType() external pure override returns (uint16) {
        return POOL_TYPE;
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
    function poolCollectionUpgrader() external view override returns (IPoolCollectionUpgrader) {
        return _poolCollectionUpgrader;
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
    function pools() external view override returns (ReserveToken[] memory) {
        uint256 length = _pools.length();
        ReserveToken[] memory list = new ReserveToken[](length);
        for (uint256 i = 0; i < length; i = uncheckedInc(i)) {
            list[i] = ReserveToken.wrap(_pools.at(i));
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
    function createPool(ReserveToken reserveToken) external override only(address(_network)) nonReentrant {
        if (!_settings.isTokenWhitelisted(reserveToken)) {
            revert NotWhitelisted();
        }

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

        _addPool(reserveToken, newPool);

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
    function isPoolValid(ReserveToken reserveToken) external view override returns (bool) {
        return _validPool(_poolData[reserveToken]);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function isPoolRateStable(ReserveToken reserveToken) external view override returns (bool) {
        Pool memory data = _poolData[reserveToken];
        if (!_validPool(data)) {
            return false;
        }

        // verify that the average rate of the pool isn't deviated too much from its spot rate
        return
            PoolAverageRate.isPoolRateStable(
                Fraction({
                    n: data.liquidity.networkTokenTradingLiquidity,
                    d: data.liquidity.baseTokenTradingLiquidity
                }),
                data.averageRate,
                _settings.averageRateMaxDeviationPPM()
            );
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolData(ReserveToken reserveToken) external view returns (Pool memory) {
        return _poolData[reserveToken];
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolLiquidity(ReserveToken reserveToken) external view override returns (PoolLiquidity memory) {
        return _poolData[reserveToken].liquidity;
    }

    /**
     * @dev sets the trading fee of a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setTradingFeePPM(ReserveToken pool, uint32 newTradingFeePPM)
        external
        onlyOwner
        validFee(newTradingFeePPM)
    {
        Pool storage data = _poolStorage(pool);

        uint32 prevTradingFeePPM = data.tradingFeePPM;
        if (prevTradingFeePPM == newTradingFeePPM) {
            return;
        }

        data.tradingFeePPM = newTradingFeePPM;

        emit TradingFeePPMUpdated({ pool: pool, prevFeePPM: prevTradingFeePPM, newFeePPM: newTradingFeePPM });
    }

    /**
     * @dev enables/disables trading in a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableTrading(ReserveToken pool, bool status) external onlyOwner {
        Pool storage data = _poolStorage(pool);

        if (data.tradingEnabled == status) {
            return;
        }

        data.tradingEnabled = status;

        emit TradingEnabled({ pool: pool, newStatus: status, reason: TRADING_STATUS_UPDATE_OWNER });
    }

    /**
     * @dev enables/disables depositing to a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableDepositing(ReserveToken pool, bool status) external onlyOwner {
        Pool storage data = _poolStorage(pool);

        if (data.depositingEnabled == status) {
            return;
        }

        data.depositingEnabled = status;

        emit DepositingEnabled({ pool: pool, newStatus: status });
    }

    /**
     * @dev sets the initial rate of a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setInitialRate(ReserveToken pool, Fraction memory newInitialRate)
        external
        onlyOwner
        validRate(newInitialRate)
    {
        Pool storage data = _poolStorage(pool);

        Fraction memory prevInitialRate = data.initialRate;
        if (prevInitialRate.n == newInitialRate.n && prevInitialRate.d == newInitialRate.d) {
            return;
        }

        data.initialRate = newInitialRate;

        emit InitialRateUpdated({ pool: pool, prevRate: prevInitialRate, newRate: newInitialRate });
    }

    /**
     * @dev sets the deposit limit of a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setDepositLimit(ReserveToken pool, uint256 newDepositLimit) external onlyOwner {
        Pool storage data = _poolStorage(pool);

        uint256 prevDepositLimit = data.depositLimit;
        if (prevDepositLimit == newDepositLimit) {
            return;
        }

        data.depositLimit = newDepositLimit;

        emit DepositLimitUpdated({ pool: pool, prevDepositLimit: prevDepositLimit, newDepositLimit: newDepositLimit });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function depositFor(
        address provider,
        ReserveToken pool,
        uint256 baseTokenAmount,
        uint256 unallocatedNetworkTokenLiquidity
    )
        external
        override
        only(address(_network))
        validAddress(provider)
        validAddress(ReserveToken.unwrap(pool))
        greaterThanZero(baseTokenAmount)
        nonReentrant
        returns (DepositAmounts memory)
    {
        PoolDepositParams memory depositParams = _poolDepositParams(
            pool,
            baseTokenAmount,
            unallocatedNetworkTokenLiquidity
        );

        Pool memory data = _poolData[pool];

        if (depositParams.useInitialRate) {
            // if we're using the initial rate, ensure that the average rate is set
            if (data.averageRate.rate.n != data.initialRate.n || data.averageRate.rate.d != data.initialRate.d) {
                data.averageRate.rate = data.initialRate;
            }
        } else {
            // otherwise, ensure that the initial rate is properly reset
            data.initialRate = _zeroFraction();
        }

        // if we've passed above the minimum network token liquidity for trading - emit that trading is now enabled
        if (data.tradingEnabled) {
            uint256 minLiquidityForTrading = _settings.minLiquidityForTrading();
            if (
                data.liquidity.networkTokenTradingLiquidity < minLiquidityForTrading &&
                data.liquidity.networkTokenTradingLiquidity + depositParams.baseTokenDeltaAmount >=
                minLiquidityForTrading
            ) {
                emit TradingEnabled({ pool: pool, newStatus: true, reason: TRADING_STATUS_UPDATE_MIN_LIQUIDITY });
            }
        }

        // calculate and update the new trading liquidity based on the provided network token amount
        data.liquidity.networkTokenTradingLiquidity += depositParams.networkTokenDeltaAmount;
        data.liquidity.baseTokenTradingLiquidity += depositParams.baseTokenDeltaAmount;
        data.liquidity.tradingLiquidityProduct =
            data.liquidity.networkTokenTradingLiquidity *
            data.liquidity.baseTokenTradingLiquidity;

        // calculate the pool token amount to mint
        IPoolToken poolToken = data.poolToken;
        uint256 currentStakedBalance = data.liquidity.stakedBalance;
        uint256 poolTokenAmount = _calcPoolTokenAmount(poolToken, baseTokenAmount, currentStakedBalance);

        // update the staked balance with the full base token amount
        data.liquidity.stakedBalance = currentStakedBalance + baseTokenAmount;

        _poolData[pool] = data;

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
        ReserveToken pool,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 externalProtectionWalletBalance
    )
        external
        override
        only(address(_network))
        validAddress(ReserveToken.unwrap(pool))
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
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount
    )
        external
        override
        only(address(_network))
        validAddress(ReserveToken.unwrap(sourceToken))
        validAddress(ReserveToken.unwrap(targetToken))
        greaterThanZero(sourceAmount)
        greaterThanZero(minReturnAmount)
        returns (TradeAmountsWithLiquidity memory)
    {
        TradingParams memory params = _tradeParams(sourceToken, targetToken);

        TradeAmounts memory tradeAmounts = _targetAmountAndFee(
            params.sourceBalance,
            params.targetBalance,
            params.tradingFeePPM,
            sourceAmount
        );

        // ensure that the trade gives something in return
        if (tradeAmounts.amount == 0) {
            revert ZeroTargetAmount();
        }

        // ensure that the target amount is above the requested minimum return amount
        if (tradeAmounts.amount < minReturnAmount) {
            revert ReturnAmountTooLow();
        }

        Pool storage data = _poolData[params.pool];

        // update the recent average rate
        _updateAverageRate(
            data,
            Fraction({
                n: params.liquidity.networkTokenTradingLiquidity,
                d: params.liquidity.baseTokenTradingLiquidity
            })
        );

        // sync the reserve balances
        uint256 newNetworkTokenTradingLiquidity;
        uint256 newBaseTokenTradingLiquidity;
        uint256 stakedBalance = params.liquidity.stakedBalance;
        if (params.isSourceNetworkToken) {
            newNetworkTokenTradingLiquidity = params.sourceBalance + sourceAmount;
            newBaseTokenTradingLiquidity = params.targetBalance - tradeAmounts.amount;

            // if the target token is a base token, make sure to add the fee to the staked balance
            stakedBalance += tradeAmounts.feeAmount;
        } else {
            newBaseTokenTradingLiquidity = params.sourceBalance + sourceAmount;
            newNetworkTokenTradingLiquidity = params.targetBalance - tradeAmounts.amount;
        }

        // update the liquidity in the pool
        PoolLiquidity memory liquidity = PoolLiquidity({
            networkTokenTradingLiquidity: newNetworkTokenTradingLiquidity,
            baseTokenTradingLiquidity: newBaseTokenTradingLiquidity,
            tradingLiquidityProduct: params.liquidity.tradingLiquidityProduct,
            stakedBalance: stakedBalance
        });

        data.liquidity = liquidity;

        return
            TradeAmountsWithLiquidity({
                amount: tradeAmounts.amount,
                feeAmount: tradeAmounts.feeAmount,
                liquidity: liquidity
            });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function tradeAmountAndFee(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 amount,
        bool targetAmount
    )
        external
        view
        override
        validAddress(ReserveToken.unwrap(sourceToken))
        validAddress(ReserveToken.unwrap(targetToken))
        greaterThanZero(amount)
        returns (TradeAmounts memory)
    {
        TradingParams memory params = _tradeParams(sourceToken, targetToken);

        return
            targetAmount
                ? _targetAmountAndFee(params.sourceBalance, params.targetBalance, params.tradingFeePPM, amount)
                : _sourceAmountAndFee(params.sourceBalance, params.targetBalance, params.tradingFeePPM, amount);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function onFeesCollected(ReserveToken pool, uint256 baseTokenAmount)
        external
        override
        only(address(_network))
        validAddress(ReserveToken.unwrap(pool))
    {
        if (baseTokenAmount == 0) {
            return;
        }

        Pool storage data = _poolStorage(pool);

        // increase the staked balance by the given amount
        data.liquidity.stakedBalance += baseTokenAmount;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function migratePoolIn(ReserveToken pool, Pool calldata data)
        external
        override
        validAddress(ReserveToken.unwrap(pool))
        only(address(_poolCollectionUpgrader))
    {
        _addPool(pool, data);

        data.poolToken.acceptOwnership();

        emit PoolUpdated({ reserveToken: pool });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function migratePoolOut(ReserveToken pool, IPoolCollection targetPoolCollection)
        external
        override
        validAddress(ReserveToken.unwrap(pool))
        validAddress(address(targetPoolCollection))
        only(address(_poolCollectionUpgrader))
    {
        if (_network.latestPoolCollection(POOL_TYPE) != targetPoolCollection) {
            revert InvalidPoolCollection();
        }

        IPoolToken poolToken = _poolData[pool].poolToken;

        _removePool(pool);

        poolToken.transferOwnership(address(targetPoolCollection));

        emit PoolRemoved({ reserveToken: pool });
    }

    /**
     * @dev adds a pool
     */
    function _addPool(ReserveToken pool, Pool memory data) private {
        if (!_pools.add(ReserveToken.unwrap(pool))) {
            revert AlreadyExists();
        }

        _poolData[pool] = data;
    }

    /**
     * @dev removes a pool
     */
    function _removePool(ReserveToken pool) private {
        if (!_pools.remove(ReserveToken.unwrap(pool))) {
            revert DoesNotExist();
        }

        delete _poolData[pool];
    }

    /**
     * @dev returns deposit-related output data
     */
    function _poolDepositParams(
        ReserveToken pool,
        uint256 baseTokenAmount,
        uint256 unallocatedNetworkTokenLiquidity
    ) private view returns (PoolDepositParams memory depositParams) {
        Pool memory data = _poolData[pool];
        if (!_validPool(data)) {
            revert DoesNotExist();
        }

        // get the effective rate to use when calculating the matching network token trading liquidity amount
        uint256 minLiquidityForTrading = _settings.minLiquidityForTrading();
        if (minLiquidityForTrading == 0) {
            revert MinLiquidityNotSet();
        }

        // verify that the staked balance and the newly deposited amount isn’t higher than the deposit limit
        if (data.liquidity.stakedBalance + baseTokenAmount > data.depositLimit) {
            revert DepositLimitExceeded();
        }

        Fraction memory rate;
        depositParams.useInitialRate = data.liquidity.networkTokenTradingLiquidity < minLiquidityForTrading;
        if (depositParams.useInitialRate) {
            // if the minimum network token trading liquidity isn't met - use the initial rate (but ensure that it was
            // actually set)
            if (!_isFractionValid(data.initialRate)) {
                revert NoInitialRate();
            }

            rate = data.initialRate;
        } else {
            // if the minimum network token trading liquidity is met - use the average rate
            rate = data.averageRate.rate;
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
            uint256 unavailableNetworkTokenAmount;
            unchecked {
                unavailableNetworkTokenAmount =
                    depositParams.networkTokenDeltaAmount -
                    unallocatedNetworkTokenLiquidity;
            }

            depositParams.networkTokenDeltaAmount = unallocatedNetworkTokenLiquidity;
            depositParams.baseTokenExcessLiquidity = MathEx.mulDivF(unavailableNetworkTokenAmount, rate.d, rate.n);
        }

        // base token amount is guaranteed to be larger than the excess liquidity
        unchecked {
            depositParams.baseTokenDeltaAmount = baseTokenAmount - depositParams.baseTokenExcessLiquidity;
        }
    }

    /**
     * @dev returns withdrawal amounts
     */
    function _poolWithdrawalAmounts(
        ReserveToken pool,
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
    function _poolWithdrawalParams(ReserveToken pool) private view returns (PoolWithdrawalParams memory) {
        Pool memory data = _poolData[pool];
        if (!_validPool(data)) {
            revert DoesNotExist();
        }

        uint256 prod = data.liquidity.networkTokenTradingLiquidity * data.liquidity.baseTokenTradingLiquidity;

        return
            PoolWithdrawalParams({
                networkTokenAvgTradingLiquidity: MathEx.floorSqrt(
                    MathEx.mulDivF(prod, data.averageRate.rate.n, data.averageRate.rate.d)
                ),
                baseTokenAvgTradingLiquidity: MathEx.floorSqrt(
                    MathEx.mulDivF(prod, data.averageRate.rate.d, data.averageRate.rate.n)
                ),
                baseTokenTradingLiquidity: data.liquidity.baseTokenTradingLiquidity,
                basePoolTokenTotalSupply: data.poolToken.totalSupply(),
                baseTokenStakedAmount: data.liquidity.stakedBalance,
                tradeFeePPM: data.tradingFeePPM
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
        ReserveToken pool,
        uint256 basePoolTokenAmount,
        uint256 baseTokenTradingLiquidityDelta,
        uint256 networkTokenTradingLiquidityDelta
    ) private {
        Pool storage data = _poolData[pool];
        uint256 totalSupply = data.poolToken.totalSupply();

        // all of these are at most 128 bits, but we store them as uint256 in order to avoid 128-bit multiplication
        // overflows
        uint256 baseTokenCurrTradingLiquidity = data.liquidity.baseTokenTradingLiquidity;
        uint256 networkTokenCurrTradingLiquidity = data.liquidity.networkTokenTradingLiquidity;
        uint256 baseTokenNewTradingLiquidity = baseTokenCurrTradingLiquidity - baseTokenTradingLiquidityDelta;
        uint256 networkTokenNewTradingLiquidity = networkTokenCurrTradingLiquidity - networkTokenTradingLiquidityDelta;

        data.poolToken.burnFrom(address(_network), basePoolTokenAmount);

        unchecked {
            data.liquidity.stakedBalance = MathEx.mulDivF(
                data.liquidity.stakedBalance,
                totalSupply - basePoolTokenAmount,
                totalSupply
            );
        }
        data.liquidity.baseTokenTradingLiquidity = baseTokenNewTradingLiquidity;
        data.liquidity.networkTokenTradingLiquidity = networkTokenNewTradingLiquidity;
        data.liquidity.tradingLiquidityProduct = baseTokenNewTradingLiquidity * networkTokenNewTradingLiquidity;

        // ensure that the average rate is reset when the pool is being emptied
        if (baseTokenNewTradingLiquidity == 0) {
            data.averageRate.rate = _zeroFraction();
        }

        if (data.tradingEnabled) {
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
        uint32 tradeFeePPM,
        uint32 withdrawalFeePPM,
        uint256 basePoolTokenWithdrawalAmount
    ) internal pure returns (WithdrawalAmounts memory amounts) {
        uint256 baseTokenVaultBalance = baseTokenLiquidity + baseTokenExcessAmount;

        if (baseTokenStakedAmount > baseTokenVaultBalance) {
            uint256 baseTokenOffsetAmount;
            unchecked {
                baseTokenOffsetAmount = _deductFee(
                    baseTokenStakedAmount - baseTokenVaultBalance,
                    basePoolTokenWithdrawalAmount,
                    basePoolTokenTotalSupply,
                    withdrawalFeePPM
                );
            }

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

        uint256 baseTokenShare = baseTokenStakedAmount * basePoolTokenWithdrawalAmount;

        amounts.baseTokenAmountToTransferFromVaultToProvider = _deductFee(
            1,
            baseTokenShare,
            basePoolTokenTotalSupply,
            withdrawalFeePPM
        );

        amounts.baseTokenAmountToDeductFromLiquidity = _deductFee(
            baseTokenLiquidity,
            baseTokenShare,
            basePoolTokenTotalSupply * baseTokenVaultBalance,
            withdrawalFeePPM
        );

        amounts.networkTokenAmountToDeductFromLiquidity = _deductFee(
            networkTokenLiquidity,
            baseTokenShare,
            basePoolTokenTotalSupply * baseTokenVaultBalance,
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
                networkTokenArbitrageAmount + amounts.networkTokenAmountToDeductFromLiquidity <= networkTokenLiquidity
            ) {
                amounts.networkTokenArbitrageAmount = -networkTokenArbitrageAmount.toInt256();
            }
        } else {
            // the pool is in a base token deficit
            if (amounts.baseTokenAmountToTransferFromVaultToProvider <= baseTokenVaultBalance) {
                uint256 baseTokenOffsetAmount;
                unchecked {
                    baseTokenOffsetAmount = _deductFee(
                        baseTokenStakedAmount - baseTokenVaultBalance,
                        basePoolTokenWithdrawalAmount,
                        basePoolTokenTotalSupply,
                        withdrawalFeePPM
                    );
                }

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
                uint256 aMx = networkTokenLiquidity * basePoolTokenWithdrawalAmount;
                uint256 bMd = baseTokenLiquidity * basePoolTokenTotalSupply;

                unchecked {
                    amounts.networkTokenAmountToMintForProvider = _deductFee(
                        baseTokenStakedAmount - baseTokenVaultBalance,
                        aMx,
                        bMd,
                        withdrawalFeePPM
                    );
                }

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
        uint32 n
    ) internal pure returns (uint256) {
        uint32 remainingPPM;
        unchecked {
            remainingPPM = PPM_RESOLUTION - n;
        }
        return MathEx.mulDivF(x, y * remainingPPM, z * PPM_RESOLUTION);
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
        uint32 withdrawalFeePPM
    )
        internal
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFee;
        unchecked {
            baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFee = MathEx.mulDivF(
                baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
                PPM_RESOLUTION,
                PPM_RESOLUTION - withdrawalFeePPM
            );
        }
        uint256 baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFeeMulRatio = MathEx.mulDivF(
            baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFee,
            basePoolTokenTotalSupply,
            baseTokenStakedAmount
        );
        return (
            basePoolTokenWithdrawalAmount -
                baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFeeMulRatio,
            basePoolTokenTotalSupply - baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFeeMulRatio,
            baseTokenStakedAmount - baseTokenAmountToTransferFromExternalProtectionWalletToProviderPlusFee
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
        uint32 tradeFeePPM,
        uint32 withdrawalFeePPM,
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
        uint32 tradeFeePPM,
        uint32 withdrawalFeePPM,
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
        uint32 tradeFeePPM
    ) internal pure returns (Quotient[2] memory) {
        uint256 bm = baseTokenLiquidity * tradeFeePPM;
        uint256 fm = baseTokenOffsetAmount * tradeFeePPM;
        uint256 bM = baseTokenLiquidity * PPM_RESOLUTION;
        uint256 fM = baseTokenOffsetAmount * PPM_RESOLUTION;
        uint32 remainingPPM;
        unchecked {
            remainingPPM = 2 * PPM_RESOLUTION - tradeFeePPM;
        }
        return [
            Quotient({ n1: fM + bm, n2: 2 * fm, d1: bM, d2: fm }),
            Quotient({ n1: baseTokenLiquidity * remainingPPM, n2: fM, d1: bM, d2: fm })
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
        uint32 tradeFeePPM
    ) internal pure returns (Quotient[2] memory) {
        uint256 bm = baseTokenLiquidity * tradeFeePPM;
        uint256 fm = baseTokenOffsetAmount * tradeFeePPM;
        uint256 bM = baseTokenLiquidity * PPM_RESOLUTION;
        uint256 fM = baseTokenOffsetAmount * PPM_RESOLUTION;
        uint32 remainingPPM;
        unchecked {
            remainingPPM = 2 * PPM_RESOLUTION - tradeFeePPM;
        }
        return [
            Quotient({ n1: fM, n2: bm + 2 * fm, d1: bM + fm, d2: 0 }),
            Quotient({ n1: baseTokenLiquidity * remainingPPM + fM, n2: 0, d1: bM + fm, d2: 0 })
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
            MathEx.mulDivF(baseTokenShare, withdrawalFeePPM, basePoolTokenTotalSupply * PPM_RESOLUTION)
        ) {
            Fraction memory z = _subMax0(quotients[1]);
            return MathEx.mulDivF(networkTokenLiquidity * baseTokenOffsetAmount, z.n, baseTokenLiquidity * z.d);
        }
        return 0;
    }

    /**
     * @dev returns the maximum of `(q.n1 - q.n2) / (q.d1 - q.d2)` and 0
     */
    function _subMax0(Quotient memory q) internal pure returns (Fraction memory) {
        unchecked {
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
    function _poolStorage(ReserveToken pool) private view returns (Pool storage) {
        Pool storage data = _poolData[pool];
        if (!_validPool(data)) {
            revert DoesNotExist();
        }

        return data;
    }

    /**
     * @dev returns whether a pool is valid
     */
    function _validPool(Pool memory pool) private pure returns (bool) {
        return address(pool.poolToken) != address(0);
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
            if (stakedBalance > 0) {
                revert InvalidStakedBalance();
            }

            return baseTokenAmount;
        }

        return MathEx.mulDivF(baseTokenAmount, poolTokenTotalSupply, stakedBalance);
    }

    /**
     * @dev returns trading params
     */
    function _tradeParams(ReserveToken sourceToken, ReserveToken targetToken)
        private
        view
        returns (TradingParams memory params)
    {
        // ensure that the network token is either the source or the target pool
        bool isSourceNetworkToken = sourceToken.toIERC20() == _networkToken;
        bool isTargetNetworkToken = targetToken.toIERC20() == _networkToken;
        if (isSourceNetworkToken && !isTargetNetworkToken) {
            params.isSourceNetworkToken = true;
            params.pool = targetToken;
        } else if (!isSourceNetworkToken && isTargetNetworkToken) {
            params.isSourceNetworkToken = false;
            params.pool = sourceToken;
        } else {
            // the network token isn't one of the pools or is both of them
            revert InvalidPool();
        }

        Pool memory data = _poolData[params.pool];
        if (!_validPool(data)) {
            revert DoesNotExist();
        }

        params.liquidity = data.liquidity;
        params.tradingFeePPM = data.tradingFeePPM;

        // verify that trading is enabled
        if (!data.tradingEnabled) {
            revert TradingDisabled();
        }

        // verify that liquidity is above the minimum network token liquidity for trading
        if (params.liquidity.networkTokenTradingLiquidity < _settings.minLiquidityForTrading()) {
            revert LiquidityTooLow();
        }

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
        if (sourceBalance == 0 || targetBalance == 0) {
            revert InvalidPoolBalance();
        }

        uint256 targetAmount = MathEx.mulDivF(targetBalance, sourceAmount, sourceBalance + sourceAmount);
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
        if (sourceBalance == 0) {
            revert InvalidPoolBalance();
        }

        uint256 feeAmount = MathEx.mulDivF(targetAmount, tradingFeePPM, PPM_RESOLUTION - tradingFeePPM);
        uint256 fullTargetAmount = targetAmount + feeAmount;
        uint256 sourceAmount = MathEx.mulDivF(sourceBalance, fullTargetAmount, targetBalance - fullTargetAmount);

        return TradeAmounts({ amount: sourceAmount, feeAmount: feeAmount });
    }

    /**
     * @dev updates the average rate
     */
    function _updateAverageRate(Pool storage data, Fraction memory spotRate) private {
        AverageRate memory currentAverageRate = data.averageRate;
        AverageRate memory newAverageRate = PoolAverageRate.calcAverageRate(spotRate, currentAverageRate, _time());

        if (
            newAverageRate.time != currentAverageRate.time ||
            !PoolAverageRate.isEqual(newAverageRate, currentAverageRate)
        ) {
            data.averageRate = newAverageRate;
        }
    }
}

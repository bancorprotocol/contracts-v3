// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { Fraction, Sint256 } from "../utility/Types.sol";
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

import { PoolCollectionWithdrawal } from "./PoolCollectionWithdrawal.sol";

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
contract PoolCollection is IPoolCollection, Owned, ReentrancyGuard, Time, Utils {
    using ReserveTokenLibrary for ReserveToken;
    using EnumerableSet for EnumerableSet.AddressSet;

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
    INetworkSettings private immutable _networkSettings;

    // the pool token factory contract
    IPoolTokenFactory private immutable _poolTokenFactory;

    // the pool collection upgrader contract
    IPoolCollectionUpgrader private immutable _poolCollectionUpgrader;

    // a mapping between reserve tokens and their pools
    mapping(ReserveToken => Pool) internal _poolData;

    // the set of all pools which are managed by this pool collection
    EnumerableSet.AddressSet private _pools;

    // the default trading fee (in units of PPM)
    uint32 private _defaultTradingFeePPM;

    /**
     * @dev triggered when a pool is created
     */
    event PoolCreated(IPoolToken indexed poolToken, ReserveToken indexed reserveToken);

    /**
     * @dev triggered when a pool is migrated into a this pool collection
     */
    event PoolMigratedIn(ReserveToken indexed reserveToken);

    /**
     * @dev triggered when a pool is migrated out of this pool collection
     */
    event PoolMigratedOut(ReserveToken indexed reserveToken);

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
     * @dev initializes a new PoolCollection contract
     */
    constructor(
        IBancorNetwork initNetwork,
        IERC20 initNetworkToken,
        INetworkSettings initNetworkSettings,
        IPoolTokenFactory initPoolTokenFactory,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    )
        validAddress(address(initNetwork))
        validAddress(address(initNetworkToken))
        validAddress(address(initNetworkSettings))
        validAddress(address(initPoolTokenFactory))
        validAddress(address(initPoolCollectionUpgrader))
    {
        _network = initNetwork;
        _networkToken = initNetworkToken;
        _networkSettings = initNetworkSettings;
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
    function version() external view virtual returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolType() external pure returns (uint16) {
        return POOL_TYPE;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function defaultTradingFeePPM() external view returns (uint32) {
        return _defaultTradingFeePPM;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolToken(ReserveToken reserveToken) external view returns (IPoolToken) {
        return _poolData[reserveToken].poolToken;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function pools() external view returns (ReserveToken[] memory) {
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
    function poolCount() external view returns (uint256) {
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
    function createPool(ReserveToken reserveToken) external only(address(_network)) nonReentrant {
        if (!_networkSettings.isTokenWhitelisted(reserveToken)) {
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
    function isPoolValid(ReserveToken reserveToken) external view returns (bool) {
        return _validPool(_poolData[reserveToken]);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function isPoolRateStable(ReserveToken reserveToken) external view returns (bool) {
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
                _networkSettings.averageRateMaxDeviationPPM()
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
    function poolLiquidity(ReserveToken reserveToken) external view returns (PoolLiquidity memory) {
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
            uint256 minLiquidityForTrading = _networkSettings.minLiquidityForTrading();
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
        uint256 externalProtectionVaultBalance
    )
        external
        only(address(_network))
        validAddress(ReserveToken.unwrap(pool))
        greaterThanZero(basePoolTokenAmount)
        nonReentrant
        returns (WithdrawalAmounts memory amounts)
    {
        // obtain the withdrawal amounts
        amounts = _poolWithdrawalAmounts(
            pool,
            basePoolTokenAmount,
            baseTokenVaultBalance,
            externalProtectionVaultBalance
        );

        // execute the actual withdrawal
        _executeWithdrawal(
            pool,
            basePoolTokenAmount,
            amounts.baseTokensTradingLiquidityDelta,
            amounts.networkTokensTradingLiquidityDelta
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
    function onFeesCollected(ReserveToken pool, uint256 feeAmount)
        external
        only(address(_network))
        validAddress(ReserveToken.unwrap(pool))
    {
        if (feeAmount == 0) {
            return;
        }

        Pool storage data = _poolStorage(pool);

        // increase the staked balance by the given amount
        data.liquidity.stakedBalance += feeAmount;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function migratePoolIn(ReserveToken pool, Pool calldata data)
        external
        validAddress(ReserveToken.unwrap(pool))
        only(address(_poolCollectionUpgrader))
    {
        _addPool(pool, data);

        data.poolToken.acceptOwnership();

        emit PoolMigratedIn({ reserveToken: pool });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function migratePoolOut(ReserveToken pool, IPoolCollection targetPoolCollection)
        external
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

        emit PoolMigratedOut({ reserveToken: pool });
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
        uint256 minLiquidityForTrading = _networkSettings.minLiquidityForTrading();
        if (minLiquidityForTrading == 0) {
            revert MinLiquidityNotSet();
        }

        // verify that the staked balance and the newly deposited amount isn't higher than the deposit limit
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
        uint256 externalProtectionVaultBalance
    ) internal view returns (WithdrawalAmounts memory amounts) {
        PoolWithdrawalParams memory params = _poolWithdrawalParams(pool);

        PoolCollectionWithdrawal.Output memory output = PoolCollectionWithdrawal.calculateWithdrawalAmounts(
            params.networkTokenAvgTradingLiquidity,
            params.baseTokenAvgTradingLiquidity,
            MathEx.subMax0(baseTokenVaultBalance, params.baseTokenTradingLiquidity),
            params.baseTokenStakedAmount,
            externalProtectionVaultBalance,
            params.tradeFeePPM,
            _networkSettings.withdrawalFeePPM(),
            MathEx.mulDivF(basePoolTokenAmount, params.baseTokenStakedAmount, params.basePoolTokenTotalSupply)
        );

        amounts.baseTokensToTransferFromMasterVault = output.s;
        amounts.networkTokensToMintForProvider = output.t;
        amounts.baseTokensToTransferFromEPV = output.u;
        amounts.baseTokensTradingLiquidityDelta = output.r;
        amounts.networkTokensTradingLiquidityDelta = output.p;
        amounts.networkTokensProtocolHoldingsDelta = output.q;
        amounts.baseTokensWithdrawalFee = output.v;
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
     * @dev executes the following actions:
     *
     * - burn the network's base pool tokens
     * - update the pool's base token staked balance
     * - update the pool's base token trading liquidity
     * - update the pool's network token trading liquidity
     * - update the pool's trading liquidity product
     * - emit an event if the pool's network token trading liquidity has crossed the minimum threshold
     *   (either above the threshold or below the threshold)
     */
    function _executeWithdrawal(
        ReserveToken pool,
        uint256 basePoolTokenAmount,
        Sint256 memory baseTokenTradingLiquidityDelta,
        Sint256 memory networkTokenTradingLiquidityDelta
    ) private {
        Pool storage data = _poolData[pool];
        uint256 totalSupply = data.poolToken.totalSupply();

        // all of these are at most 128 bits, but we store them as uint256 in order to avoid 128-bit multiplication
        // overflows
        uint256 baseTokenCurrTradingLiquidity = data.liquidity.baseTokenTradingLiquidity;
        uint256 networkTokenCurrTradingLiquidity = data.liquidity.networkTokenTradingLiquidity;
        uint256 baseTokenNewTradingLiquidity = baseTokenTradingLiquidityDelta.isNeg
            ? baseTokenCurrTradingLiquidity - baseTokenTradingLiquidityDelta.value
            : baseTokenCurrTradingLiquidity + baseTokenTradingLiquidityDelta.value;
        uint256 networkTokenNewTradingLiquidity = networkTokenTradingLiquidityDelta.isNeg
            ? networkTokenCurrTradingLiquidity - networkTokenTradingLiquidityDelta.value
            : networkTokenCurrTradingLiquidity + networkTokenTradingLiquidityDelta.value;

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
            uint256 minLiquidityForTrading = _networkSettings.minLiquidityForTrading();
            bool currEnabled = networkTokenCurrTradingLiquidity >= minLiquidityForTrading;
            bool newEnabled = networkTokenNewTradingLiquidity >= minLiquidityForTrading;
            if (newEnabled != currEnabled) {
                emit TradingEnabled({ pool: pool, newStatus: newEnabled, reason: TRADING_STATUS_UPDATE_MIN_LIQUIDITY });
            }
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
        if (params.liquidity.networkTokenTradingLiquidity < _networkSettings.minLiquidityForTrading()) {
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

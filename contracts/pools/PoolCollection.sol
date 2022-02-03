// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Fraction, Fraction112, Sint256, zeroFraction, zeroFraction112, isFractionPositive, isFraction112Positive, toFraction112, fromFraction112 } from "../utility/Types.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Owned } from "../utility/Owned.sol";
import { BlockNumber } from "../utility/BlockNumber.sol";
import { MathEx } from "../utility/MathEx.sol";

// prettier-ignore
import {
    Utils,
    AlreadyExists,
    DoesNotExist,
    InvalidPoolCollection,
    InvalidStakedBalance
} from "../utility/Utils.sol";

import { INetworkSettings, NotWhitelisted } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolTokenFactory } from "./interfaces/IPoolTokenFactory.sol";
import { IPoolCollectionUpgrader } from "./interfaces/IPoolCollectionUpgrader.sol";

// prettier-ignore
import {
    AverageRate,
    IPoolCollection,
    PoolLiquidity,
    Pool,
    TRADING_STATUS_UPDATE_DEFAULT,
    TRADING_STATUS_UPDATE_ADMIN,
    TRADING_STATUS_UPDATE_MIN_LIQUIDITY,
    TradeAmounts,
    TradeAmounts
} from "./interfaces/IPoolCollection.sol";

import { IMasterPool } from "./interfaces/IMasterPool.sol";

import { PoolCollectionWithdrawal } from "./PoolCollectionWithdrawal.sol";

// base token withdrawal output amounts
struct WithdrawalAmounts {
    uint256 baseTokensToTransferFromMasterVault; // base token amount to transfer from the master vault to the provider
    uint256 networkTokensToMintForProvider; // network token amount to mint directly for the provider
    uint256 baseTokensToTransferFromEPV; // base token amount to transfer from the external protection vault to the provider
    Sint256 baseTokensTradingLiquidityDelta; // base token amount to add to the trading liquidity
    Sint256 networkTokensTradingLiquidityDelta; // network token amount to add to the trading liquidity and to the master vault
    Sint256 networkTokensProtocolHoldingsDelta; // network token amount add to the protocol equity
    uint256 baseTokensWithdrawalFee; // base token amount to keep in the pool as a withdrawal fee
    uint256 poolTokenTotalSupply; // base pool token's total supply
    uint256 newBaseTokenTradingLiquidity; // new base token trading liquidity
    uint256 newNetworkTokenTradingLiquidity; // new network token trading liquidity
}

/**
 * @dev Pool Collection contract
 *
 * notes:
 *
 * - the address of reserve token serves as the pool unique ID in both contract functions and events
 */
contract PoolCollection is IPoolCollection, Owned, ReentrancyGuard, BlockNumber, Utils {
    using TokenLibrary for Token;
    using EnumerableSet for EnumerableSet.AddressSet;

    error DepositLimitExceeded();
    error InsufficientLiquidity();
    error InvalidRate();
    error InsufficientReturnAmount();
    error InsufficientSourceAmount();
    error RateUnstable();
    error ReturnAmountTooLow();
    error TradingDisabled();
    error AlreadyEnabled();

    uint16 private constant POOL_TYPE = 1;
    uint256 private constant EMA_AVERAGE_RATE_WEIGHT = 4;
    uint256 private constant EMA_SPOT_RATE_WEIGHT = 1;
    uint256 private constant LIQUIDITY_GROWTH_FACTOR = 2;
    uint256 private constant BOOTSTRAPPING_LIQUIDITY_BUFFER_FACTOR = 2;
    uint32 private constant DEFAULT_TRADING_FEE_PPM = 2000; // 0.2%
    uint32 private constant RATE_MAX_DEVIATION_PPM = 10000; // %1
    // the average rate is recalculated based on the ratio between the weights of the rates
    // the smaller the weights are, the larger the supported range of each one of the rates is

    // trading-related preprocessed data
    struct TradingParams {
        uint256 sourceBalance;
        uint256 targetBalance;
        PoolLiquidity liquidity;
        Token pool;
        bool isSourceNetworkToken;
        uint32 tradingFeePPM;
    }

    // the network contract
    IBancorNetwork private immutable _network;

    // the address of the network token
    IERC20 private immutable _networkToken;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the master vault contract
    IMasterVault private immutable _masterVault;

    // the master pool contract
    IMasterPool internal immutable _masterPool;

    // the address of the external protection vault
    IExternalProtectionVault private immutable _externalProtectionVault;

    // the pool token factory contract
    IPoolTokenFactory private immutable _poolTokenFactory;

    // the pool collection upgrader contract
    IPoolCollectionUpgrader private immutable _poolCollectionUpgrader;

    // a mapping between tokens and their pools
    mapping(Token => Pool) internal _poolData;

    // the set of all pools which are managed by this pool collection
    EnumerableSet.AddressSet private _pools;

    // the default trading fee (in units of PPM)
    uint32 private _defaultTradingFeePPM;

    /**
     * @dev triggered when a pool is created
     */
    event PoolCreated(IPoolToken indexed poolToken, Token indexed token);

    /**
     * @dev triggered when a pool is migrated into a this pool collection
     */
    event PoolMigratedIn(Token indexed token);

    /**
     * @dev triggered when a pool is migrated out of this pool collection
     */
    event PoolMigratedOut(Token indexed token);

    /**
     * @dev triggered when the default trading fee is updated
     */
    event DefaultTradingFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when a specific pool's trading fee is updated
     */
    event TradingFeePPMUpdated(Token indexed pool, uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when trading in a specific pool is enabled/disabled
     */
    event TradingEnabled(Token indexed pool, bool indexed newStatus, uint8 indexed reason);

    /**
     * @dev triggered when depositing into a specific pool is enabled/disabled
     */
    event DepositingEnabled(Token indexed pool, bool indexed newStatus);

    /**
     * @dev triggered when a pool's deposit limit is updated
     */
    event DepositLimitUpdated(Token indexed pool, uint256 prevDepositLimit, uint256 newDepositLimit);

    /**
     * @dev triggered when new liquidity is deposited into a pool
     */
    event TokenDeposited(
        bytes32 indexed contextId,
        Token indexed token,
        address indexed provider,
        uint256 tokenAmount,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when existing liquidity is withdrawn from a pool
     */
    event TokenWithdrawn(
        bytes32 indexed contextId,
        Token indexed token,
        address indexed provider,
        uint256 tokenAmount,
        uint256 poolTokenAmount,
        uint256 externalProtectionBaseTokenAmount,
        uint256 networkTokenAmount,
        uint256 withdrawalFeeAmount
    );

    /**
     * @dev triggered when the trading liquidity in a pool is updated
     */
    event TradingLiquidityUpdated(
        bytes32 indexed contextId,
        Token indexed pool,
        Token indexed token,
        uint256 liquidity
    );

    /**
     * @dev triggered when the total liquidity in a pool is updated
     */
    event TotalLiquidityUpdated(
        bytes32 indexed contextId,
        Token indexed pool,
        uint256 stakedBalance,
        uint256 poolTokenSupply,
        uint256 actualBalance
    );

    /**
     * @dev initializes a new PoolCollection contract
     */
    constructor(
        IBancorNetwork initNetwork,
        IERC20 initNetworkToken,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IMasterPool initMasterPool,
        IExternalProtectionVault initExternalProtectionVault,
        IPoolTokenFactory initPoolTokenFactory,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    )
        validAddress(address(initNetwork))
        validAddress(address(initNetworkToken))
        validAddress(address(initNetworkSettings))
        validAddress(address(initMasterVault))
        validAddress(address(initMasterPool))
        validAddress(address(initExternalProtectionVault))
        validAddress(address(initPoolTokenFactory))
        validAddress(address(initPoolCollectionUpgrader))
    {
        _network = initNetwork;
        _networkToken = initNetworkToken;
        _networkSettings = initNetworkSettings;
        _masterVault = initMasterVault;
        _masterPool = initMasterPool;
        _externalProtectionVault = initExternalProtectionVault;
        _poolTokenFactory = initPoolTokenFactory;
        _poolCollectionUpgrader = initPoolCollectionUpgrader;

        _setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
    }

    modifier validRate(Fraction memory rate) {
        _validRate(rate);

        _;
    }

    function _validRate(Fraction memory rate) internal pure {
        if (!isFractionPositive(rate)) {
            revert InvalidRate();
        }
    }

    /**
     * @inheritdoc IVersioned
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
    function pools() external view returns (Token[] memory) {
        uint256 length = _pools.length();
        Token[] memory list = new Token[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = Token(_pools.at(i));
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
    function createPool(Token token) external only(address(_network)) nonReentrant {
        if (!_networkSettings.isTokenWhitelisted(token)) {
            revert NotWhitelisted();
        }

        IPoolToken newPoolToken = IPoolToken(_poolTokenFactory.createPoolToken(token));

        newPoolToken.acceptOwnership();

        Pool memory newPool = Pool({
            poolToken: newPoolToken,
            tradingFeePPM: _defaultTradingFeePPM,
            tradingEnabled: false,
            depositingEnabled: true,
            averageRate: AverageRate({ blockNumber: 0, rate: zeroFraction112() }),
            depositLimit: 0,
            liquidity: PoolLiquidity({
                networkTokenTradingLiquidity: 0,
                baseTokenTradingLiquidity: 0,
                stakedBalance: 0
            })
        });

        _addPool(token, newPool);

        emit PoolCreated({ poolToken: newPoolToken, token: token });

        emit TradingEnabled({ pool: token, newStatus: false, reason: TRADING_STATUS_UPDATE_DEFAULT });
        emit TradingFeePPMUpdated({ pool: token, prevFeePPM: 0, newFeePPM: newPool.tradingFeePPM });
        emit DepositingEnabled({ pool: token, newStatus: newPool.depositingEnabled });
        emit DepositLimitUpdated({ pool: token, prevDepositLimit: 0, newDepositLimit: newPool.depositLimit });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function isPoolValid(Token pool) external view returns (bool) {
        return _validPool(_poolData[pool]);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function isPoolRateStable(Token pool) external view returns (bool) {
        Pool memory data = _poolData[pool];
        if (!_validPool(data)) {
            return false;
        }

        return _isPoolRateStable(data.liquidity, data.averageRate);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolData(Token pool) external view returns (Pool memory) {
        return _poolData[pool];
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolLiquidity(Token pool) external view returns (PoolLiquidity memory) {
        return _poolData[pool].liquidity;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolToken(Token pool) external view returns (IPoolToken) {
        return _poolData[pool].poolToken;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolTokenToUnderlying(Token pool, uint256 poolTokenAmount) external view returns (uint256) {
        Pool memory data = _poolData[pool];

        return MathEx.mulDivF(poolTokenAmount, data.liquidity.stakedBalance, data.poolToken.totalSupply());
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function underlyingToPoolToken(Token pool, uint256 tokenAmount) external view returns (uint256) {
        Pool memory data = _poolData[pool];

        return _underlyingToPoolToken(data.poolToken.totalSupply(), tokenAmount, data.liquidity.stakedBalance);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolTokenAmountToBurn(
        Token pool,
        uint256 tokenAmountToDistribute,
        uint256 protocolPoolTokenAmount
    ) external view returns (uint256) {
        if (tokenAmountToDistribute == 0) {
            return 0;
        }

        Pool memory data = _poolData[pool];

        uint256 poolTokenSupply = data.poolToken.totalSupply();
        uint256 val = tokenAmountToDistribute * poolTokenSupply;

        return
            MathEx.mulDivF(
                val,
                poolTokenSupply,
                val + data.liquidity.stakedBalance * (poolTokenSupply - protocolPoolTokenAmount)
            );
    }

    /**
     * @dev sets the trading fee of a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setTradingFeePPM(Token pool, uint32 newTradingFeePPM) external onlyOwner validFee(newTradingFeePPM) {
        Pool storage data = _poolStorage(pool);

        uint32 prevTradingFeePPM = data.tradingFeePPM;
        if (prevTradingFeePPM == newTradingFeePPM) {
            return;
        }

        data.tradingFeePPM = newTradingFeePPM;

        emit TradingFeePPMUpdated({ pool: pool, prevFeePPM: prevTradingFeePPM, newFeePPM: newTradingFeePPM });
    }

    /**
     * @dev enabled trading in a given pool and updates its trading liquidity
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableTrading(Token pool, Fraction memory fundingRate) external onlyOwner validRate(fundingRate) {
        Pool storage data = _poolStorage(pool);

        if (data.tradingEnabled) {
            revert AlreadyEnabled();
        }

        // adjust the trading liquidity based on the base token vault balance and funding limits
        uint256 minLiquidityForTrading = _networkSettings.minLiquidityForTrading();
        _updateTradingLiquidity(bytes32(0), pool, data, data.liquidity, fundingRate, minLiquidityForTrading);

        // verify that network token trading liquidity is equal or greater than the minimum liquidity for trading
        if (data.liquidity.networkTokenTradingLiquidity < minLiquidityForTrading) {
            revert InsufficientLiquidity();
        }

        data.averageRate = AverageRate({ blockNumber: _blockNumber(), rate: toFraction112(fundingRate) });

        data.tradingEnabled = true;

        emit TradingEnabled({ pool: pool, newStatus: true, reason: TRADING_STATUS_UPDATE_ADMIN });
    }

    /**
     * @dev disables trading in a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function disableTrading(Token pool) external onlyOwner {
        Pool storage data = _poolStorage(pool);

        _resetTradingLiquidity(bytes32(0), pool, data, TRADING_STATUS_UPDATE_ADMIN);
    }

    /**
     * @dev enables/disables depositing into a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableDepositing(Token pool, bool status) external onlyOwner {
        Pool storage data = _poolStorage(pool);

        if (data.depositingEnabled == status) {
            return;
        }

        data.depositingEnabled = status;

        emit DepositingEnabled({ pool: pool, newStatus: status });
    }

    /**
     * @dev sets the deposit limit of a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setDepositLimit(Token pool, uint256 newDepositLimit) external onlyOwner {
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
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 tokenAmount
    ) external only(address(_network)) validAddress(provider) greaterThanZero(tokenAmount) nonReentrant {
        Pool storage data = _poolStorage(pool);

        // calculate the pool token amount to mint
        uint256 currentStakedBalance = data.liquidity.stakedBalance;
        uint256 prevPoolTokenTotalSupply = data.poolToken.totalSupply();
        uint256 poolTokenAmount = _underlyingToPoolToken(prevPoolTokenTotalSupply, tokenAmount, currentStakedBalance);

        // verify that the staked balance and the newly deposited amount isn't higher than the deposit limit
        uint256 newStakedBalance = currentStakedBalance + tokenAmount;
        if (newStakedBalance > data.depositLimit) {
            revert DepositLimitExceeded();
        }

        PoolLiquidity memory prevLiquidity = data.liquidity;

        // update the staked balance with the full base token amount
        data.liquidity.stakedBalance = newStakedBalance;

        // mint pool tokens to the provider
        data.poolToken.mint(provider, poolTokenAmount);

        // adjust the trading liquidity based on the base token vault balance and funding limits
        _updateTradingLiquidity(
            contextId,
            pool,
            data,
            data.liquidity,
            zeroFraction(),
            _networkSettings.minLiquidityForTrading()
        );

        emit TokenDeposited({
            contextId: contextId,
            token: pool,
            provider: provider,
            tokenAmount: tokenAmount,
            poolTokenAmount: poolTokenAmount
        });

        _dispatchTradingLiquidityEvents(
            contextId,
            pool,
            prevPoolTokenTotalSupply + poolTokenAmount,
            prevLiquidity,
            data.liquidity
        );
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function withdraw(
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 poolTokenAmount
    ) external only(address(_network)) validAddress(provider) greaterThanZero(poolTokenAmount) nonReentrant {
        // obtain the withdrawal amounts
        WithdrawalAmounts memory amounts = _poolWithdrawalAmounts(pool, poolTokenAmount);

        // execute the actual withdrawal
        _executeWithdrawal(contextId, provider, pool, poolTokenAmount, amounts);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function trade(
        bytes32 contextId,
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount
    )
        external
        only(address(_network))
        greaterThanZero(sourceAmount)
        greaterThanZero(minReturnAmount)
        returns (TradeAmounts memory)
    {
        TradingParams memory params = _tradeParams(sourceToken, targetToken);

        TradeAmounts memory tradeAmounts = _targetAmountAndFee(
            params.sourceBalance,
            params.targetBalance,
            params.tradingFeePPM,
            sourceAmount
        );

        // ensure that the target amount is above the requested minimum return amount
        if (tradeAmounts.amount < minReturnAmount) {
            revert InsufficientReturnAmount();
        }

        // perform the trade and update the liquidity
        _performTrade(contextId, params, sourceAmount, tradeAmounts.amount, tradeAmounts.feeAmount);

        return TradeAmounts({ amount: tradeAmounts.amount, feeAmount: tradeAmounts.feeAmount });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function tradeExact(
        bytes32 contextId,
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount,
        uint256 maxSourceAmount
    )
        external
        only(address(_network))
        greaterThanZero(targetAmount)
        greaterThanZero(maxSourceAmount)
        returns (TradeAmounts memory)
    {
        TradingParams memory params = _tradeParams(sourceToken, targetToken);

        TradeAmounts memory sourceAmounts = _sourceAmountAndFee(
            params.sourceBalance,
            params.targetBalance,
            params.tradingFeePPM,
            targetAmount
        );

        // ensure that the user has provided enough tokens to make the trade
        if (sourceAmounts.amount > maxSourceAmount) {
            revert InsufficientSourceAmount();
        }

        // perform the trade and update the liquidity
        _performTrade(contextId, params, sourceAmounts.amount, targetAmount, sourceAmounts.feeAmount);

        return TradeAmounts({ amount: sourceAmounts.amount, feeAmount: sourceAmounts.feeAmount });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function tradeAmountAndFee(
        Token sourceToken,
        Token targetToken,
        uint256 amount,
        bool targetAmount
    ) external view greaterThanZero(amount) returns (TradeAmounts memory) {
        TradingParams memory params = _tradeParams(sourceToken, targetToken);

        return
            targetAmount
                ? _targetAmountAndFee(params.sourceBalance, params.targetBalance, params.tradingFeePPM, amount)
                : _sourceAmountAndFee(params.sourceBalance, params.targetBalance, params.tradingFeePPM, amount);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function onFeesCollected(Token pool, uint256 feeAmount) external only(address(_network)) {
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
    function migratePoolIn(Token pool, Pool calldata data)
        external
        validAddress(address(pool))
        only(address(_poolCollectionUpgrader))
    {
        _addPool(pool, data);

        data.poolToken.acceptOwnership();

        emit PoolMigratedIn({ token: pool });
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function migratePoolOut(Token pool, IPoolCollection targetPoolCollection)
        external
        validAddress(address(targetPoolCollection))
        only(address(_poolCollectionUpgrader))
    {
        if (_network.latestPoolCollection(POOL_TYPE) != targetPoolCollection) {
            revert InvalidPoolCollection();
        }

        IPoolToken cachedPoolToken = _poolData[pool].poolToken;

        _removePool(pool);

        cachedPoolToken.transferOwnership(address(targetPoolCollection));

        emit PoolMigratedOut({ token: pool });
    }

    /**
     * @dev adds a pool
     */
    function _addPool(Token pool, Pool memory data) private {
        if (!_pools.add(address(pool))) {
            revert AlreadyExists();
        }

        _poolData[pool] = data;
    }

    /**
     * @dev removes a pool
     */
    function _removePool(Token pool) private {
        if (!_pools.remove(address(pool))) {
            revert DoesNotExist();
        }

        delete _poolData[pool];
    }

    /**
     * @dev returns withdrawal amounts
     */
    function _poolWithdrawalAmounts(Token pool, uint256 poolTokenAmount)
        internal
        view
        returns (WithdrawalAmounts memory)
    {
        Pool memory data = _poolData[pool];
        if (!_validPool(data)) {
            revert DoesNotExist();
        }

        uint256 poolTokenTotalSupply = data.poolToken.totalSupply();
        PoolCollectionWithdrawal.Output memory output = PoolCollectionWithdrawal.calculateWithdrawalAmounts(
            data.liquidity.networkTokenTradingLiquidity,
            data.liquidity.baseTokenTradingLiquidity,
            MathEx.subMax0(pool.balanceOf(address(_masterVault)), data.liquidity.baseTokenTradingLiquidity),
            data.liquidity.stakedBalance,
            pool.balanceOf(address(_externalProtectionVault)),
            data.tradingFeePPM,
            _networkSettings.withdrawalFeePPM(),
            MathEx.mulDivF(poolTokenAmount, data.liquidity.stakedBalance, poolTokenTotalSupply)
        );

        return
            WithdrawalAmounts({
                baseTokensToTransferFromMasterVault: output.s,
                networkTokensToMintForProvider: output.t,
                baseTokensToTransferFromEPV: output.u,
                baseTokensTradingLiquidityDelta: output.r,
                networkTokensTradingLiquidityDelta: output.p,
                networkTokensProtocolHoldingsDelta: output.q,
                baseTokensWithdrawalFee: output.v,
                poolTokenTotalSupply: poolTokenTotalSupply,
                newBaseTokenTradingLiquidity: output.r.isNeg
                    ? data.liquidity.baseTokenTradingLiquidity - output.r.value
                    : data.liquidity.baseTokenTradingLiquidity + output.r.value,
                newNetworkTokenTradingLiquidity: output.p.isNeg
                    ? data.liquidity.networkTokenTradingLiquidity - output.p.value
                    : data.liquidity.networkTokenTradingLiquidity + output.p.value
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
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 poolTokenAmount,
        WithdrawalAmounts memory amounts
    ) private {
        Pool storage data = _poolStorage(pool);
        PoolLiquidity storage liquidity = data.liquidity;
        PoolLiquidity memory prevLiquidity = liquidity;
        AverageRate memory averageRate = data.averageRate;

        if (
            prevLiquidity.networkTokenTradingLiquidity != 0 &&
            prevLiquidity.baseTokenTradingLiquidity != 0 &&
            averageRate.blockNumber != 0 &&
            isFraction112Positive(averageRate.rate) &&
            !_isPoolRateStable(prevLiquidity, averageRate)
        ) {
            revert RateUnstable();
        }

        data.poolToken.burnFrom(address(_network), poolTokenAmount);
        uint256 newPoolTokenTotalSupply = amounts.poolTokenTotalSupply - poolTokenAmount;

        liquidity.stakedBalance = MathEx.mulDivF(
            liquidity.stakedBalance,
            newPoolTokenTotalSupply,
            amounts.poolTokenTotalSupply
        );

        liquidity.baseTokenTradingLiquidity = amounts.newBaseTokenTradingLiquidity;
        liquidity.networkTokenTradingLiquidity = amounts.newNetworkTokenTradingLiquidity;

        if (amounts.networkTokensProtocolHoldingsDelta.value > 0) {
            assert(amounts.networkTokensProtocolHoldingsDelta.isNeg); // currently no support for requesting funding here

            _masterPool.renounceFunding(contextId, pool, amounts.networkTokensProtocolHoldingsDelta.value);
        }

        if (amounts.networkTokensTradingLiquidityDelta.value > 0) {
            if (amounts.networkTokensTradingLiquidityDelta.isNeg) {
                _masterPool.burnFromVault(amounts.networkTokensTradingLiquidityDelta.value);
            } else {
                _masterPool.mint(address(_masterVault), amounts.networkTokensTradingLiquidityDelta.value);
            }
        }

        // if the provider should receive some network tokens - ask the master pool to mint network tokens to the
        // provider
        if (amounts.networkTokensToMintForProvider > 0) {
            _masterPool.mint(address(provider), amounts.networkTokensToMintForProvider);
        }

        // if the provider should receive some base tokens from the external protection vault - remove the tokens from
        // the external protection vault and send them to the master vault
        if (amounts.baseTokensToTransferFromEPV > 0) {
            _externalProtectionVault.withdrawFunds(
                pool,
                payable(address(_masterVault)),
                amounts.baseTokensToTransferFromEPV
            );
            amounts.baseTokensToTransferFromMasterVault += amounts.baseTokensToTransferFromEPV;
        }

        // if the provider should receive some base tokens from the master vault - remove the tokens from the master
        // vault and send them to the provider
        if (amounts.baseTokensToTransferFromMasterVault > 0) {
            _masterVault.withdrawFunds(pool, payable(provider), amounts.baseTokensToTransferFromMasterVault);
        }

        // ensure that the average rate is reset when the pool is being emptied
        if (amounts.newBaseTokenTradingLiquidity == 0) {
            data.averageRate.rate = zeroFraction112();
        }

        // if the new network token trading liquidity is below the minimum liquidity for trading - reset the liquidity
        if (amounts.newNetworkTokenTradingLiquidity < _networkSettings.minLiquidityForTrading()) {
            _resetTradingLiquidity(
                contextId,
                pool,
                data,
                amounts.newNetworkTokenTradingLiquidity,
                TRADING_STATUS_UPDATE_MIN_LIQUIDITY
            );
        }

        emit TokenWithdrawn({
            contextId: contextId,
            token: pool,
            provider: provider,
            tokenAmount: amounts.baseTokensToTransferFromMasterVault,
            poolTokenAmount: poolTokenAmount,
            externalProtectionBaseTokenAmount: amounts.baseTokensToTransferFromEPV,
            networkTokenAmount: amounts.networkTokensToMintForProvider,
            withdrawalFeeAmount: amounts.baseTokensWithdrawalFee
        });

        _dispatchTradingLiquidityEvents(contextId, pool, newPoolTokenTotalSupply, prevLiquidity, data.liquidity);
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
    function _poolStorage(Token pool) private view returns (Pool storage) {
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
     * @dev calculates pool tokens amount
     */
    function _underlyingToPoolToken(
        uint256 poolTokenSupply,
        uint256 tokenAmount,
        uint256 stakedBalance
    ) private pure returns (uint256) {
        if (poolTokenSupply == 0) {
            // if this is the initial liquidity provision - use a one-to-one pool token to base token rate
            if (stakedBalance > 0) {
                revert InvalidStakedBalance();
            }

            return tokenAmount;
        }

        return MathEx.mulDivF(tokenAmount, poolTokenSupply, stakedBalance);
    }

    /**
     * @dev adjusts the trading liquidity based on the base token vault balance and funding limits
     */
    function _updateTradingLiquidity(
        bytes32 contextId,
        Token pool,
        Pool storage data,
        PoolLiquidity memory liquidity,
        Fraction memory fundingRate,
        uint256 minLiquidityForTrading
    ) private {
        bool isFundingRateValid = isFractionPositive(fundingRate);

        // if we aren't bootstrapping the pool, ensure that the network token trading liquidity is above the minimum
        // liquidity for trading
        if (liquidity.networkTokenTradingLiquidity < minLiquidityForTrading && !isFundingRateValid) {
            _resetTradingLiquidity(contextId, pool, data, TRADING_STATUS_UPDATE_MIN_LIQUIDITY);

            return;
        }

        // ensure that the base token reserve isn't empty
        uint256 tokenReserveAmount = pool.balanceOf(address(_masterVault));
        if (tokenReserveAmount == 0) {
            _resetTradingLiquidity(contextId, pool, data, TRADING_STATUS_UPDATE_MIN_LIQUIDITY);

            return;
        }

        // try to check whether the pool is stable (when both reserves and the average rate are available)
        AverageRate memory averageRate = data.averageRate;
        bool isAverageRateValid = averageRate.blockNumber != 0 && isFraction112Positive(averageRate.rate);
        if (
            liquidity.networkTokenTradingLiquidity != 0 &&
            liquidity.baseTokenTradingLiquidity != 0 &&
            isAverageRateValid &&
            !_isPoolRateStable(liquidity, averageRate)
        ) {
            return;
        }

        // figure out the effective funding rate
        Fraction memory effectiveFundingRate;
        if (isFundingRateValid) {
            effectiveFundingRate = fundingRate;
        } else if (isAverageRateValid) {
            effectiveFundingRate = fromFraction112(averageRate.rate);
        } else {
            _resetTradingLiquidity(contextId, pool, data, TRADING_STATUS_UPDATE_MIN_LIQUIDITY);

            return;
        }

        // calculate the target network token trading liquidity based on the smaller between the following:
        // - pool funding limit (e.g., the total funding limit could have been reduced by the DAO)
        // - network token liquidity required to match previously deposited based token liquidity
        // - maximum available network token trading liquidity (current amount + available funding)
        uint256 targetNetworkTokenTradingLiquidity = Math.min(
            Math.min(
                _networkSettings.poolFundingLimit(pool),
                MathEx.mulDivF(tokenReserveAmount, effectiveFundingRate.n, effectiveFundingRate.d)
            ),
            liquidity.networkTokenTradingLiquidity + _masterPool.availableFunding(pool)
        );

        // ensure that the target is above the minimum liquidity for trading
        if (targetNetworkTokenTradingLiquidity < minLiquidityForTrading) {
            _resetTradingLiquidity(contextId, pool, data, TRADING_STATUS_UPDATE_MIN_LIQUIDITY);

            return;
        }

        // calculate the new network token trading liquidity and cap it by the growth factor
        if (liquidity.networkTokenTradingLiquidity == 0) {
            // if the current network token trading liquidity is 0, set it to the minimum liquidity for trading (with an
            // additional buffer so that initial trades will be less likely to trigger disabling of trading)
            uint256 newTargetNetworkTokenTradingLiquidity = minLiquidityForTrading *
                BOOTSTRAPPING_LIQUIDITY_BUFFER_FACTOR;

            // ensure that we're not allocating more than the previously established limits
            if (newTargetNetworkTokenTradingLiquidity > targetNetworkTokenTradingLiquidity) {
                return;
            }

            targetNetworkTokenTradingLiquidity = newTargetNetworkTokenTradingLiquidity;
        } else if (targetNetworkTokenTradingLiquidity >= liquidity.networkTokenTradingLiquidity) {
            // if the target is above the current trading liquidity, limit it by factoring the current value up
            targetNetworkTokenTradingLiquidity = Math.min(
                targetNetworkTokenTradingLiquidity,
                liquidity.networkTokenTradingLiquidity * LIQUIDITY_GROWTH_FACTOR
            );
        } else {
            // if the target is below the current trading liquidity, limit it by factoring the current value down
            targetNetworkTokenTradingLiquidity = Math.max(
                targetNetworkTokenTradingLiquidity,
                liquidity.networkTokenTradingLiquidity / LIQUIDITY_GROWTH_FACTOR
            );
        }

        // update funding from the master pool
        if (targetNetworkTokenTradingLiquidity > liquidity.networkTokenTradingLiquidity) {
            _masterPool.requestFunding(
                contextId,
                pool,
                targetNetworkTokenTradingLiquidity - liquidity.networkTokenTradingLiquidity
            );
        } else if (targetNetworkTokenTradingLiquidity < liquidity.networkTokenTradingLiquidity) {
            _masterPool.renounceFunding(
                contextId,
                pool,
                liquidity.networkTokenTradingLiquidity - targetNetworkTokenTradingLiquidity
            );
        }

        // calculate the base token trading liquidity based on the new network token trading liquidity and the effective
        // funding rate (please note that the effective funding rate is always the rate between the network token and
        // the base token)
        uint256 baseTokenTradingLiquidity = MathEx.mulDivF(
            targetNetworkTokenTradingLiquidity,
            effectiveFundingRate.d,
            effectiveFundingRate.n
        );

        // update the liquidity data of the pool
        PoolLiquidity memory newLiquidity = PoolLiquidity({
            networkTokenTradingLiquidity: targetNetworkTokenTradingLiquidity,
            baseTokenTradingLiquidity: baseTokenTradingLiquidity,
            stakedBalance: liquidity.stakedBalance
        });

        data.liquidity = newLiquidity;

        _dispatchTradingLiquidityEvents(contextId, pool, data.poolToken.totalSupply(), liquidity, newLiquidity);
    }

    function _dispatchTradingLiquidityEvents(
        bytes32 contextId,
        Token pool,
        PoolLiquidity memory prevLiquidity,
        PoolLiquidity memory newLiquidity
    ) private {
        if (newLiquidity.networkTokenTradingLiquidity != prevLiquidity.networkTokenTradingLiquidity) {
            emit TradingLiquidityUpdated({
                contextId: contextId,
                pool: pool,
                token: Token(address(_networkToken)),
                liquidity: newLiquidity.networkTokenTradingLiquidity
            });
        }

        if (newLiquidity.baseTokenTradingLiquidity != prevLiquidity.baseTokenTradingLiquidity) {
            emit TradingLiquidityUpdated({
                contextId: contextId,
                pool: pool,
                token: pool,
                liquidity: newLiquidity.baseTokenTradingLiquidity
            });
        }
    }

    function _dispatchTradingLiquidityEvents(
        bytes32 contextId,
        Token pool,
        uint256 poolTokenTotalSupply,
        PoolLiquidity memory prevLiquidity,
        PoolLiquidity memory newLiquidity
    ) private {
        _dispatchTradingLiquidityEvents(contextId, pool, prevLiquidity, newLiquidity);

        if (newLiquidity.stakedBalance != prevLiquidity.stakedBalance) {
            emit TotalLiquidityUpdated({
                contextId: contextId,
                pool: pool,
                poolTokenSupply: poolTokenTotalSupply,
                stakedBalance: newLiquidity.stakedBalance,
                actualBalance: pool.balanceOf(address(_masterVault))
            });
        }
    }

    /**
     * @dev resets trading liquidity and renounces any remaining network token funding
     */
    function _resetTradingLiquidity(
        bytes32 contextId,
        Token pool,
        Pool storage data,
        uint8 reason
    ) private {
        _resetTradingLiquidity(contextId, pool, data, data.liquidity.networkTokenTradingLiquidity, reason);
    }

    /**
     * @dev resets trading liquidity and renounces any remaining network token funding
     */
    function _resetTradingLiquidity(
        bytes32 contextId,
        Token pool,
        Pool storage data,
        uint256 currentNetworkTokenTradingLiquidity,
        uint8 reason
    ) private {
        // reset the network and base token trading liquidities
        data.liquidity.networkTokenTradingLiquidity = 0;
        data.liquidity.baseTokenTradingLiquidity = 0;

        // reset the recent average rage
        data.averageRate = AverageRate({ blockNumber: 0, rate: zeroFraction112() });

        // ensure that trading is disabled
        if (data.tradingEnabled) {
            data.tradingEnabled = false;

            emit TradingEnabled({ pool: pool, newStatus: false, reason: reason });
        }

        // renounce all network liquidity
        if (currentNetworkTokenTradingLiquidity > 0) {
            _masterPool.renounceFunding(contextId, pool, currentNetworkTokenTradingLiquidity);
        }
    }

    /**
     * @dev returns trading params
     */
    function _tradeParams(Token sourceToken, Token targetToken) private view returns (TradingParams memory params) {
        // ensure that the network token is either the source or the target pool
        bool isSourceNetworkToken = sourceToken.isEqual(_networkToken);
        bool isTargetNetworkToken = targetToken.isEqual(_networkToken);
        if (isSourceNetworkToken && !isTargetNetworkToken) {
            params.isSourceNetworkToken = true;
            params.pool = targetToken;
        } else if (!isSourceNetworkToken && isTargetNetworkToken) {
            params.isSourceNetworkToken = false;
            params.pool = sourceToken;
        } else {
            // the network token isn't one of the pools or is both of them
            revert DoesNotExist();
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
            revert InsufficientLiquidity();
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
            revert InsufficientLiquidity();
        }

        uint256 feeAmount = MathEx.mulDivF(targetAmount, tradingFeePPM, PPM_RESOLUTION - tradingFeePPM);
        uint256 fullTargetAmount = targetAmount + feeAmount;
        uint256 sourceAmount = MathEx.mulDivF(sourceBalance, fullTargetAmount, targetBalance - fullTargetAmount);

        return TradeAmounts({ amount: sourceAmount, feeAmount: feeAmount });
    }

    /**
     * @dev performs a trade and updates the trading liquidity
     */
    function _performTrade(
        bytes32 contextId,
        TradingParams memory params,
        uint256 sourceAmount,
        uint256 targetAmount,
        uint256 feeAmount
    ) private {
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
        PoolLiquidity memory newLiquidity;
        if (params.isSourceNetworkToken) {
            // if the target token is a base token, make sure to add the fee to the staked balance
            newLiquidity = PoolLiquidity({
                networkTokenTradingLiquidity: params.sourceBalance + sourceAmount,
                baseTokenTradingLiquidity: params.targetBalance - targetAmount,
                stakedBalance: params.liquidity.stakedBalance + feeAmount
            });
        } else {
            newLiquidity = PoolLiquidity({
                networkTokenTradingLiquidity: params.targetBalance - targetAmount,
                baseTokenTradingLiquidity: params.sourceBalance + sourceAmount,
                stakedBalance: params.liquidity.stakedBalance
            });
        }

        // update the liquidity in the pool
        PoolLiquidity memory prevLiquidity = data.liquidity;
        data.liquidity = newLiquidity;

        _dispatchTradingLiquidityEvents(contextId, params.pool, prevLiquidity, newLiquidity);
    }

    /**
     * @dev returns whether a pool's rate is stable
     */
    function _isPoolRateStable(PoolLiquidity memory liquidity, AverageRate memory averageRateInfo)
        private
        view
        returns (bool)
    {
        Fraction memory spotRate = Fraction({
            n: liquidity.networkTokenTradingLiquidity,
            d: liquidity.baseTokenTradingLiquidity
        });

        Fraction112 memory averageRate = averageRateInfo.rate;
        if (averageRateInfo.blockNumber != _blockNumber()) {
            averageRate = _calcAverageRate(averageRate, spotRate);
        }

        return MathEx.isInRange(fromFraction112(averageRate), spotRate, RATE_MAX_DEVIATION_PPM);
    }

    /**
     * @dev updates the average rate
     */
    function _updateAverageRate(Pool storage data, Fraction memory spotRate) private {
        uint32 blockNumber = _blockNumber();

        if (data.averageRate.blockNumber != blockNumber) {
            data.averageRate = AverageRate({
                blockNumber: blockNumber,
                rate: _calcAverageRate(data.averageRate.rate, spotRate)
            });
        }
    }

    /**
     * @dev calculates the average rate
     */
    function _calcAverageRate(Fraction112 memory averageRate, Fraction memory spotRate)
        private
        pure
        returns (Fraction112 memory)
    {
        return
            toFraction112(
                MathEx.weightedAverage(
                    fromFraction112(averageRate),
                    spotRate,
                    EMA_AVERAGE_RATE_WEIGHT,
                    EMA_SPOT_RATE_WEIGHT
                )
            );
    }
}

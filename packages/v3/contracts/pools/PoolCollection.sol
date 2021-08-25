// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Math } from "@openzeppelin/contracts/math/Math.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

import { Fraction } from "../utility/Types.sol";
import { MAX_UINT128, PPM_RESOLUTION } from "../utility/Constants.sol";
import { OwnedUpgradeable } from "../utility/OwnedUpgradeable.sol";
import { Utils } from "../utility/Utils.sol";
import { MathEx } from "../utility/MathEx.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolCollection, PoolLiquidity, Pool, WithdrawalAmounts, Action } from "./interfaces/IPoolCollection.sol";
import { INetworkTokenPool } from "./interfaces/INetworkTokenPool.sol";

import { PoolToken } from "./PoolToken.sol";
import { PoolAverageRate, AverageRate } from "./PoolAverageRate.sol";

/**
 * @dev Pool Collection contract
 *
 * notes:
 *
 * - in Bancor V3, the address of reserve token serves as the pool unique ID in both contract functions and events
 */
contract PoolCollection is IPoolCollection, OwnedUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using SafeMath for uint256;

    uint32 private constant DEFAULT_TRADING_FEE_PPM = 2000; // 0.2%

    string private constant POOL_TOKEN_SYMBOL_PREFIX = "bn";
    string private constant POOL_TOKEN_NAME_PREFIX = "Bancor";
    string private constant POOL_TOKEN_NAME_SUFFIX = "Pool Token";

    // withdrawal-related input which can be retrieved from the pool
    struct PoolWithdrawalParams {
        uint256 networkTokenAvgTradingLiquidity;
        uint256 baseTokenAvgTradingLiquidity;
        uint256 baseTokenTradingLiquidity;
        uint256 basePoolTokenTotalSupply;
        uint256 baseTokenStakedAmount;
        uint256 tradeFeePPM;
    }

    // represents `(n1 - n2) / (d1 - d2)`
    struct Quotient {
        uint256 n1;
        uint256 n2;
        uint256 d1;
        uint256 d2;
    }

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the network token pool contract
    INetworkTokenPool private immutable _networkTokenPool;

    // a mapping between reserve tokens and their pools
    mapping(IReserveToken => Pool) internal _pools;

    // a mapping between reserve tokens and custom symbol overrides (only needed for tokens with malformed symbol property)
    mapping(IReserveToken => string) private _tokenSymbolOverrides;

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
    event TradingEnabled(IReserveToken indexed pool, bool newStatus);

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
    constructor(IBancorNetwork initNetwork, INetworkTokenPool initNetworkTokenPool)
        validAddress(address(initNetwork))
        validAddress(address(initNetworkTokenPool))
    {
        __Owned_init();
        __ReentrancyGuard_init();

        _network = initNetwork;
        _settings = initNetwork.settings();
        _networkTokenPool = initNetworkTokenPool;

        _setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
    }

    modifier validRate(Fraction memory rate) {
        _validRate(rate);

        _;
    }

    function _validRate(Fraction memory rate) internal pure {
        require(rate.d != 0, "ERR_INVALID_RATE");
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
    function settings() external view override returns (INetworkSettings) {
        return _settings;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function networkTokenPool() external view override returns (INetworkTokenPool) {
        return _networkTokenPool;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function tokenSymbolOverride(IReserveToken reserveToken) external view override returns (string memory) {
        return _tokenSymbolOverrides[reserveToken];
    }

    /**
     * @dev sets the custom symbol overrides for a given reserve token
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setTokenSymbolOverride(IReserveToken reserveToken, string calldata symbolOverride) external onlyOwner {
        _tokenSymbolOverrides[reserveToken] = symbolOverride;
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function defaultTradingFeePPM() external view override returns (uint32) {
        return _defaultTradingFeePPM;
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
        require(!_validPool(_pools[reserveToken]), "ERR_POOL_ALREADY_EXISTS");

        (string memory name, string memory symbol) = _poolTokenMetadata(reserveToken);
        PoolToken newPoolToken = new PoolToken(name, symbol, reserveToken);

        Pool memory newPool = Pool({
            poolToken: newPoolToken,
            tradingFeePPM: _defaultTradingFeePPM,
            tradingEnabled: true,
            depositingEnabled: true,
            averageRate: AverageRate({ time: 0, rate: Fraction({ n: 0, d: 1 }) }),
            initialRate: Fraction({ n: 0, d: 1 }),
            depositLimit: 0,
            liquidity: PoolLiquidity({
                baseTokenTradingLiquidity: 0,
                networkTokenTradingLiquidity: 0,
                tradingLiquidityProduct: 0,
                stakedBalance: 0
            })
        });

        _pools[reserveToken] = newPool;

        emit PoolCreated({ poolToken: newPoolToken, reserveToken: reserveToken });

        emit TradingFeePPMUpdated({ pool: reserveToken, prevFeePPM: 0, newFeePPM: newPool.tradingFeePPM });
        emit TradingEnabled({ pool: reserveToken, newStatus: newPool.tradingEnabled });
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
    function poolData(IReserveToken reserveToken) external view override returns (Pool memory) {
        return _pools[reserveToken];
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function isPoolValid(IReserveToken reserveToken) external view override returns (bool) {
        return _validPool(_pools[reserveToken]);
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function isPoolRateStable(IReserveToken reserveToken) external view override returns (bool) {
        Pool memory pool = _pools[reserveToken];
        if (!_validPool(pool)) {
            return false;
        }

        // verify that the average rate of the pool isn't deviated too much from its spot rate
        return
            PoolAverageRate.isPoolRateStable(
                Fraction({
                    n: pool.liquidity.baseTokenTradingLiquidity,
                    d: pool.liquidity.networkTokenTradingLiquidity
                }),
                pool.averageRate,
                _settings.averageRateMaxDeviationPPM()
            );
    }

    /**
     * @inheritdoc IPoolCollection
     */
    function poolLiquidity(IReserveToken reserveToken) external view override returns (PoolLiquidity memory) {
        return _pools[reserveToken].liquidity;
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
        Pool storage p = _poolStorage(pool);

        uint32 prevTradingFeePPM = p.tradingFeePPM;
        if (prevTradingFeePPM == newTradingFeePPM) {
            return;
        }

        p.tradingFeePPM = newTradingFeePPM;

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
        Pool storage p = _poolStorage(pool);

        if (p.tradingEnabled == status) {
            return;
        }

        p.tradingEnabled = status;

        emit TradingEnabled({ pool: pool, newStatus: status });
    }

    /**
     * @dev enables/disables depositing to a given pool
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableDepositing(IReserveToken pool, bool status) external onlyOwner {
        Pool storage p = _poolStorage(pool);

        if (p.depositingEnabled == status) {
            return;
        }

        p.depositingEnabled = status;

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
        Pool storage p = _poolStorage(pool);

        Fraction memory prevInitialRate = p.initialRate;
        if (prevInitialRate.n == newInitialRate.n && prevInitialRate.d == newInitialRate.d) {
            return;
        }

        p.initialRate = newInitialRate;

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
        Pool storage p = _poolStorage(pool);

        uint256 prevDepositLimit = p.depositLimit;
        if (prevDepositLimit == newDepositLimit) {
            return;
        }

        p.depositLimit = newDepositLimit;

        emit DepositLimitUpdated({ pool: pool, prevDepositLimit: prevDepositLimit, newDepositLimit: newDepositLimit });
    }

    /**
     * @dev handles some of the withdrawal-related actions
     * and returns all of the withdrawal-related amounts
     *
     * requirements:
     *
     * - the caller must be the network
     */
    function withdraw(
        bytes32 contextId,
        IReserveToken baseToken,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 protectionWalletBalance
    ) external override only(address(_network)) nonReentrant returns (WithdrawalAmounts memory amounts) {
        PoolWithdrawalParams memory params = _poolWithdrawalParams(baseToken);

        // obtain all withdrawal-related amounts
        amounts = _withdrawalAmounts(
            params.networkTokenAvgTradingLiquidity,
            params.baseTokenAvgTradingLiquidity,
            _cap(baseTokenVaultBalance, params.baseTokenTradingLiquidity),
            params.basePoolTokenTotalSupply,
            params.baseTokenStakedAmount,
            protectionWalletBalance,
            params.tradeFeePPM,
            _settings.withdrawalFeePPM(),
            basePoolTokenAmount
        );

        // execute post-withdrawal actions
        _postWithdrawal(
            baseToken,
            basePoolTokenAmount,
            amounts.baseTokenAmountToDeductFromLiquidity,
            amounts.networkTokenAmountToDeductFromLiquidity
        );

        // handle the minting or burning of network tokens in the pool
        if (amounts.networkTokenArbitrageAmount > 0) {
            if (amounts.networkTokenArbitrageAction == Action.MintNetworkTokens) {
                _networkTokenPool.requestLiquidity(contextId, baseToken, amounts.networkTokenArbitrageAmount, false);
            } else if (amounts.networkTokenArbitrageAction == Action.BurnNetworkTokens) {
                _networkTokenPool.renounceLiquidity(contextId, baseToken, amounts.networkTokenArbitrageAmount);
            }
        }

        // return all withdrawal-related amounts
        return amounts;
    }

    /**
     * @dev returns withdrawal-related input which can be retrieved from the pool
     */
    function _poolWithdrawalParams(IReserveToken baseToken) private view returns (PoolWithdrawalParams memory) {
        Pool memory pool = _pools[baseToken];

        uint256 prod = uint256(pool.liquidity.networkTokenTradingLiquidity) *
            uint256(pool.liquidity.baseTokenTradingLiquidity);

        return
            PoolWithdrawalParams({
                networkTokenAvgTradingLiquidity: MathEx.floorSqrt(
                    MathEx.mulDivF(prod, pool.averageRate.rate.n, pool.averageRate.rate.d)
                ),
                baseTokenAvgTradingLiquidity: MathEx.floorSqrt(
                    MathEx.mulDivF(prod, pool.averageRate.rate.d, pool.averageRate.rate.n)
                ),
                baseTokenTradingLiquidity: pool.liquidity.baseTokenTradingLiquidity,
                basePoolTokenTotalSupply: pool.poolToken.totalSupply(),
                baseTokenStakedAmount: pool.liquidity.stakedBalance,
                tradeFeePPM: pool.tradingFeePPM
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
     * - emits an event if the pool's network token trading liquidity
     *   has crossed the minimum threshold (either above it or below it)
     */
    function _postWithdrawal(
        IReserveToken baseToken,
        uint256 basePoolTokenAmount,
        uint256 baseTokenTradingLiquidityDelta,
        uint256 networkTokenTradingLiquidityDelta
    ) private {
        Pool storage pool = _pools[baseToken];
        uint256 totalSupply = pool.poolToken.totalSupply();

        // all of these are at most MAX_UINT128, but we store them as uint256 in order to avoid 128-bit multiplication
        // overflows
        uint256 baseTokenCurrTradingLiquidity = pool.liquidity.baseTokenTradingLiquidity;
        uint256 networkTokenCurrTradingLiquidity = pool.liquidity.networkTokenTradingLiquidity;
        uint256 baseTokenNextTradingLiquidity = baseTokenCurrTradingLiquidity.sub(baseTokenTradingLiquidityDelta);
        uint256 networkTokenNextTradingLiquidity = networkTokenCurrTradingLiquidity.sub(
            networkTokenTradingLiquidityDelta
        );

        pool.poolToken.burnFrom(address(_network), basePoolTokenAmount);
        pool.liquidity.stakedBalance = MathEx.mulDivF(
            pool.liquidity.stakedBalance,
            totalSupply - basePoolTokenAmount,
            totalSupply
        );
        pool.liquidity.baseTokenTradingLiquidity = uint128(baseTokenNextTradingLiquidity);
        pool.liquidity.networkTokenTradingLiquidity = uint128(networkTokenNextTradingLiquidity);
        pool.liquidity.tradingLiquidityProduct = baseTokenNextTradingLiquidity * networkTokenNextTradingLiquidity;

        if (pool.tradingEnabled) {
            uint256 minLiquidityForTrading = _settings.minLiquidityForTrading();
            bool currEnabled = networkTokenCurrTradingLiquidity >= minLiquidityForTrading;
            bool nextEnabled = networkTokenNextTradingLiquidity >= minLiquidityForTrading;
            if (nextEnabled != currEnabled) {
                emit TradingEnabled({ pool: baseToken, newStatus: nextEnabled });
            }
        }
    }

    /**
     * @dev returns all amounts related to base token withdrawal, where each amount
     * includes the withdrawal fee, which may need to be deducted (depending on usage)
     *
     * input:
     * a = network token trading liquidity
     * b = base token trading liquidity
     * c = base token excess amount
     * d = base pool token total supply
     * e = base token staked amount
     * w = base token protection wallet balance
     * m = trade fee in ppm units
     * n = withdrawal fee in ppm units
     * x = base pool token withdrawal amount
     *
     * output:
     * B = base token amount to transfer from the vault to the user
     * C = network token amount to mint directly for the user
     * D = base token amount to deduct from the trading liquidity
     * E = base token amount to transfer from the protection wallet to the user
     * F = network token amount to deduct from the trading liquidity and burn in the vault
     * G = network token amount to burn or mint in the pool, in order to create an arbitrage incentive
     * H = arbitrage action - burn network tokens in the pool or mint network tokens in the pool or neither
     */
    function _withdrawalAmounts(
        uint256 networkTokenLiquidity,
        uint256 baseTokenLiquidity,
        uint256 baseTokenExcessAmount,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenStakedAmount,
        uint256 baseTokenWalletBalance,
        uint256 tradeFee,
        uint256 withdrawalFee,
        uint256 basePoolTokenWithdrawalAmount
    ) internal pure returns (WithdrawalAmounts memory amounts) {
        uint256 bPc = baseTokenLiquidity.add(baseTokenExcessAmount);

        if (baseTokenStakedAmount > bPc) {
            uint256 baseTokenOffsetAmount = _deductFee(
                baseTokenStakedAmount - bPc,
                basePoolTokenWithdrawalAmount,
                basePoolTokenTotalSupply,
                withdrawalFee
            );
            amounts.baseTokenAmountToTransferFromWalletToUser = baseTokenOffsetAmount < baseTokenWalletBalance
                ? baseTokenOffsetAmount
                : baseTokenWalletBalance;
            (basePoolTokenWithdrawalAmount, basePoolTokenTotalSupply, baseTokenStakedAmount) = _reviseInput(
                amounts.baseTokenAmountToTransferFromWalletToUser,
                basePoolTokenWithdrawalAmount,
                basePoolTokenTotalSupply,
                baseTokenStakedAmount,
                withdrawalFee
            );
        }

        uint256 eMx = baseTokenStakedAmount.mul(basePoolTokenWithdrawalAmount);

        amounts.baseTokenAmountToTransferFromVaultToUser = _deductFee(1, eMx, basePoolTokenTotalSupply, withdrawalFee);
        amounts.baseTokenAmountToDeductFromLiquidity = _deductFee(
            baseTokenLiquidity,
            eMx,
            basePoolTokenTotalSupply.mul(bPc),
            withdrawalFee
        );
        amounts.networkTokenAmountToDeductFromLiquidity = _deductFee(
            networkTokenLiquidity,
            eMx,
            basePoolTokenTotalSupply.mul(bPc),
            0
        );

        if (bPc >= baseTokenStakedAmount) {
            // the pool is not in a base-token deficit
            uint256 baseTokenOffsetAmount = _deductFee(
                bPc - baseTokenStakedAmount,
                basePoolTokenWithdrawalAmount,
                basePoolTokenTotalSupply,
                withdrawalFee
            );
            amounts.networkTokenArbitrageAmount = _posArbitrage(
                _cap(networkTokenLiquidity, amounts.networkTokenAmountToDeductFromLiquidity),
                _cap(baseTokenLiquidity, amounts.baseTokenAmountToDeductFromLiquidity),
                basePoolTokenTotalSupply,
                baseTokenOffsetAmount,
                tradeFee,
                withdrawalFee,
                eMx
            );
            if (
                amounts.networkTokenArbitrageAmount.add(amounts.networkTokenAmountToDeductFromLiquidity) >
                networkTokenLiquidity
            ) {
                amounts.networkTokenArbitrageAmount = 0; // ideally this should be a circuit-breaker in the calling function
            }
            if (amounts.networkTokenArbitrageAmount > 0) {
                amounts.networkTokenArbitrageAction = Action.BurnNetworkTokens;
            }
        } else {
            // the pool is in a base-token deficit
            if (amounts.baseTokenAmountToTransferFromVaultToUser <= bPc) {
                uint256 baseTokenOffsetAmount = _deductFee(
                    baseTokenStakedAmount - bPc,
                    basePoolTokenWithdrawalAmount,
                    basePoolTokenTotalSupply,
                    withdrawalFee
                );
                amounts.networkTokenArbitrageAmount = _negArbitrage(
                    _cap(networkTokenLiquidity, amounts.networkTokenAmountToDeductFromLiquidity),
                    _cap(baseTokenLiquidity, amounts.baseTokenAmountToDeductFromLiquidity),
                    basePoolTokenTotalSupply,
                    baseTokenOffsetAmount,
                    tradeFee,
                    withdrawalFee,
                    eMx
                );
                if (amounts.networkTokenArbitrageAmount > 0) {
                    amounts.networkTokenArbitrageAction = Action.MintNetworkTokens;
                }
            }
            if (amounts.networkTokenArbitrageAction == Action.NoArbitrage) {
                // the withdrawal amount is larger than the vault's balance
                uint256 aMx = networkTokenLiquidity.mul(basePoolTokenWithdrawalAmount);
                uint256 bMd = baseTokenLiquidity.mul(basePoolTokenTotalSupply);
                amounts.networkTokenAmountToMintForUser = _deductFee(
                    baseTokenStakedAmount - bPc,
                    aMx,
                    bMd,
                    withdrawalFee
                );
                amounts.baseTokenAmountToTransferFromVaultToUser = _deductFee(
                    bPc,
                    basePoolTokenWithdrawalAmount,
                    basePoolTokenTotalSupply,
                    withdrawalFee
                );
                amounts.baseTokenAmountToDeductFromLiquidity = _deductFee(
                    baseTokenLiquidity,
                    basePoolTokenWithdrawalAmount,
                    basePoolTokenTotalSupply,
                    withdrawalFee
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

    // solhint-disable var-name-mixedcase

    /**
     * @dev recalculates the values of `x`, `d` and `e`
     *
     * input:
     * E = base token amount to transfer from the protection wallet to the user
     * x = base pool token withdrawal amount
     * d = base pool token total supply
     * e = base token staked amount
     * n = withdrawal fee in ppm units
     *
     * output, assuming `n` is normalized:
     * x = E / (1 - n) * d / e
     * d = E / (1 - n) * d / e
     * e = E / (1 - n)
     */
    function _reviseInput(
        uint256 baseTokenAmountToTransferFromWalletToUser,
        uint256 basePoolTokenWithdrawalAmount,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenStakedAmount,
        uint256 withdrawalFee
    )
        internal
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 g = MathEx.mulDivF(
            baseTokenAmountToTransferFromWalletToUser,
            PPM_RESOLUTION,
            PPM_RESOLUTION - withdrawalFee
        );
        uint256 h = MathEx.mulDivF(g, basePoolTokenTotalSupply, baseTokenStakedAmount);
        return (basePoolTokenWithdrawalAmount.sub(h), basePoolTokenTotalSupply.sub(h), baseTokenStakedAmount.sub(g));
    }

    // solhint-enable var-name-mixedcase

    /**
     * @dev returns the amount of network tokens which should be removed
     * from the pool in order to create an optimal arbitrage incentive
     *
     * input:
     * a = network token hypothetical trading liquidity
     * b = base token hypothetical trading liquidity
     * d = base pool token total supply
     * e = base token staked amount
     * f = base token redundant amount
     * m = trade fee in ppm units
     * n = withdrawal fee in ppm units
     * x = base pool token withdrawal amount
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
        uint256 tradeFee,
        uint256 withdrawalFee,
        uint256 ex
    ) internal pure returns (uint256) {
        return
            _calcArbitrage(
                networkTokenLiquidity,
                baseTokenLiquidity,
                basePoolTokenTotalSupply,
                baseTokenOffsetAmount,
                withdrawalFee,
                ex,
                _posArbitrage(baseTokenLiquidity, baseTokenOffsetAmount, tradeFee)
            );
    }

    /**
     * @dev returns the amount of network tokens which should be added
     * to the pool in order to create an optimal arbitrage incentive
     *
     * input:
     * a = network token hypothetical trading liquidity
     * b = base token hypothetical trading liquidity
     * d = base pool token total supply
     * e = base token staked amount
     * f = base token required amount
     * m = trade fee in ppm units
     * n = withdrawal fee in ppm units
     * x = base pool token withdrawal amount
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
        uint256 tradeFee,
        uint256 withdrawalFee,
        uint256 ex
    ) internal pure returns (uint256) {
        return
            _calcArbitrage(
                networkTokenLiquidity,
                baseTokenLiquidity,
                basePoolTokenTotalSupply,
                baseTokenOffsetAmount,
                withdrawalFee,
                ex,
                _negArbitrage(baseTokenLiquidity, baseTokenOffsetAmount, tradeFee)
            );
    }

    /**
     * @dev returns the following quotients, assuming `m` is normalized:
     * 1. `(f + bm - 2fm) / (b - fm)`
     * 2. `(2b - bm - f) / (b - fm)`
     */
    function _posArbitrage(
        uint256 baseTokenLiquidity,
        uint256 baseTokenOffsetAmount,
        uint256 tradeFee
    ) internal pure returns (Quotient[2] memory) {
        uint256 bm = baseTokenLiquidity.mul(tradeFee);
        uint256 fm = baseTokenOffsetAmount.mul(tradeFee);
        uint256 bM = baseTokenLiquidity.mul(PPM_RESOLUTION);
        uint256 fM = baseTokenOffsetAmount.mul(PPM_RESOLUTION);
        return [
            Quotient({ n1: fM.add(bm), n2: fm.mul(2), d1: bM, d2: fm }),
            Quotient({ n1: baseTokenLiquidity.mul(2 * PPM_RESOLUTION - tradeFee), n2: fM, d1: bM, d2: fm })
        ];
    }

    /**
     * @dev returns the following quotients, assuming `m` is normalized:
     * 1. `(f - bm - 2fm) / (b + fm)`
     * 2. `(2b - bm + f) / (b + fm)`
     */
    function _negArbitrage(
        uint256 baseTokenLiquidity,
        uint256 baseTokenOffsetAmount,
        uint256 tradeFee
    ) internal pure returns (Quotient[2] memory) {
        uint256 bm = baseTokenLiquidity.mul(tradeFee);
        uint256 fm = baseTokenOffsetAmount.mul(tradeFee);
        uint256 bM = baseTokenLiquidity.mul(PPM_RESOLUTION);
        uint256 fM = baseTokenOffsetAmount.mul(PPM_RESOLUTION);
        return [
            Quotient({ n1: fM, n2: bm.add(fm.mul(2)), d1: bM.add(fm), d2: 0 }),
            Quotient({
                n1: baseTokenLiquidity.mul(2 * PPM_RESOLUTION - tradeFee).add(fM),
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
        uint256 withdrawalFee,
        uint256 ex,
        Quotient[2] memory quotients
    ) internal pure returns (uint256) {
        Fraction memory y = _cap(quotients[0]);
        if (
            MathEx.mulDivF(baseTokenOffsetAmount, y.n, y.d) <
            MathEx.mulDivF(ex, withdrawalFee, basePoolTokenTotalSupply.mul(PPM_RESOLUTION))
        ) {
            Fraction memory z = _cap(quotients[1]);
            return MathEx.mulDivF(networkTokenLiquidity.mul(baseTokenOffsetAmount), z.n, baseTokenLiquidity.mul(z.d));
        }
        return 0;
    }

    /**
     * @dev returns the maximum of `n1 - n2` and 0
     */
    function _cap(uint256 n1, uint256 n2) internal pure returns (uint256) {
        return n1 > n2 ? n1 - n2 : 0;
    }

    /**
     * @dev returns the maximum of `(q.n1 - q.n2) / (q.d1 - q.d2)` and 0
     */
    function _cap(Quotient memory q) internal pure returns (Fraction memory) {
        if (q.n1 > q.n2 && q.d1 > q.d2) {
            // the quotient is finite and positive
            return Fraction({ n: q.n1 - q.n2, d: q.d1 - q.d2 });
        }
        if (q.n2 > q.n1 && q.d2 > q.d1) {
            // the quotient is finite and positive
            return Fraction({ n: q.n2 - q.n1, d: q.d2 - q.d1 });
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
     * @dev returns the name and the symbol of the pool token using either the custom token symbol override or by
     * fetching it from the reserve token itself
     */
    function _poolTokenMetadata(IReserveToken reserveToken) private view returns (string memory, string memory) {
        string memory customSymbol = _tokenSymbolOverrides[reserveToken];
        string memory tokenSymbol = bytes(customSymbol).length != 0
            ? customSymbol
            : ERC20(address(reserveToken)).symbol();

        string memory symbol = string(abi.encodePacked(POOL_TOKEN_SYMBOL_PREFIX, tokenSymbol));
        string memory name = string(
            abi.encodePacked(POOL_TOKEN_NAME_PREFIX, " ", tokenSymbol, " ", POOL_TOKEN_NAME_SUFFIX)
        );

        return (name, symbol);
    }

    /**
     * @dev returns a storage reference to pool data
     */
    function _poolStorage(IReserveToken pool) private view returns (Pool storage) {
        Pool storage p = _pools[pool];
        require(_validPool(p), "ERR_POOL_DOES_NOT_EXIST");

        return p;
    }

    /**
     * @dev returns whether a pool is valid
     */
    function _validPool(Pool memory pool) private pure returns (bool) {
        return address(pool.poolToken) != address(0x0);
    }
}

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
import { IPoolCollection } from "./interfaces/IPoolCollection.sol";
import { INetworkTokenPool } from "./interfaces/INetworkTokenPool.sol";

import { PoolToken } from "./PoolToken.sol";

/**
 * @dev Liquidity Pool Collection contract
 *
 * notes:
 *
 * - in Bancor V3, the address of reserve token serves as the pool unique ID in both contract functions and events
 */
contract PoolCollection is IPoolCollection, OwnedUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using SafeMath for uint256;
    using MathEx for *;

    uint32 private constant DEFAULT_TRADING_FEE_PPM = 2000; // 0.2%

    string private constant POOL_TOKEN_SYMBOL_PREFIX = "bn";
    string private constant POOL_TOKEN_NAME_PREFIX = "Bancor";
    string private constant POOL_TOKEN_NAME_SUFFIX = "Pool Token";

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

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the network contract
    IBancorNetwork private immutable _network;

    // a mapping between reserve tokens and their pools
    mapping(IReserveToken => Pool) private _pools;

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
    constructor(IBancorNetwork initNetwork) validAddress(address(initNetwork)) {
        __Owned_init();
        __ReentrancyGuard_init();

        _network = initNetwork;
        _settings = initNetwork.settings();

        _setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
    }

    // allows execution by the network only
    modifier onlyNetwork() {
        _onlyNetwork();

        _;
    }

    function _onlyNetwork() private view {
        require(msg.sender == address(_network), "ERR_ACCESS_DENIED");
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
    function version() external pure override returns (uint16) {
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
    function settings() external view override returns (INetworkSettings) {
        return _settings;
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
    function createPool(IReserveToken reserveToken) external override onlyNetwork nonReentrant {
        require(_settings.isTokenWhitelisted(reserveToken), "ERR_POOL_NOT_WHITELISTED");
        require(!_validPool(_pools[reserveToken]), "ERR_POOL_ALREADY_EXISTS");

        (string memory name, string memory symbol) = _poolTokenMetadata(reserveToken);
        PoolToken newPoolToken = new PoolToken(name, symbol, reserveToken);

        Pool memory newPool = Pool({
            version: 1,
            poolToken: newPoolToken,
            tradingFeePPM: _defaultTradingFeePPM,
            tradingEnabled: true,
            depositingEnabled: true,
            baseTokenTradingLiquidity: 0,
            networkTokenTradingLiquidity: 0,
            averageRate: Fraction({ n: 0, d: 1 }),
            tradingLiquidityProduct: 0,
            stakedBalance: 0,
            initialRate: Fraction({ n: 0, d: 1 }),
            depositLimit: 0
        });

        _pools[reserveToken] = newPool;

        emit PoolCreated(newPoolToken, reserveToken);

        emit TradingFeePPMUpdated(reserveToken, 0, newPool.tradingFeePPM);
        emit TradingEnabled(reserveToken, newPool.tradingEnabled);
        emit DepositingEnabled(reserveToken, newPool.depositingEnabled);
        emit InitialRateUpdated(reserveToken, Fraction({ n: 0, d: 0 }), newPool.initialRate);
        emit DepositLimitUpdated(reserveToken, 0, newPool.depositLimit);
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

        emit TradingFeePPMUpdated(pool, prevTradingFeePPM, newTradingFeePPM);
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

        emit TradingEnabled(pool, status);
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

        emit DepositingEnabled(pool, status);
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

        emit InitialRateUpdated(pool, prevInitialRate, newInitialRate);
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

        emit DepositLimitUpdated(pool, prevDepositLimit, newDepositLimit);
    }

    function withdraw(
        bytes32 contextId,
        IReserveToken baseToken,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 protectionWalletBalance,
        INetworkTokenPool networkTokenPool
    ) external override onlyNetwork nonReentrant returns (WithdrawalAmounts memory) {
        PoolWithdrawalParams memory params = poolWithdrawalParams(baseToken);

        WithdrawalAmounts memory amounts = withdrawalAmounts(
            params.networkTokenAvgTradingLiquidity,
            params.baseTokenAvgTradingLiquidity,
            cap(baseTokenVaultBalance, params.baseTokenTradingLiquidity),
            params.basePoolTokenTotalSupply,
            params.baseTokenStakedAmount,
            protectionWalletBalance,
            params.tradeFeePPM,
            _settings.withdrawalFeePPM(),
            basePoolTokenAmount
        );

        withdrawUpdatePool(baseToken, basePoolTokenAmount, amounts.D, amounts.F);

        if (amounts.G > 0) {
            if (amounts.H == Action.mintNetworkTokens) {
                networkTokenPool.requestLiquidity(contextId, baseToken, amounts.G);
            } else if (amounts.H == Action.burnNetworkTokens) {
                networkTokenPool.renounceLiquidity(contextId, baseToken, amounts.G);
            }
        }

        return amounts;
    }

    function poolWithdrawalParams(IReserveToken baseToken) private view returns (PoolWithdrawalParams memory) {
        Pool memory pool = _pools[baseToken];

        uint256 prod = uint256(pool.networkTokenTradingLiquidity) * uint256(pool.baseTokenTradingLiquidity);

        return PoolWithdrawalParams({
            networkTokenAvgTradingLiquidity: MathEx.floorSqrt(MathEx.mulDivF(prod, pool.averageRate.n, pool.averageRate.d)),
            baseTokenAvgTradingLiquidity: MathEx.floorSqrt(MathEx.mulDivF(prod, pool.averageRate.d, pool.averageRate.n)),
            baseTokenTradingLiquidity: pool.baseTokenTradingLiquidity,
            basePoolTokenTotalSupply: pool.poolToken.totalSupply(),
            baseTokenStakedAmount: pool.stakedBalance,
            tradeFeePPM: pool.tradingFeePPM
        });
    }

    function withdrawUpdatePool(
        IReserveToken baseToken,
        uint256 basePoolTokenAmount,
        uint256 baseTokenTradingLiquidityDelta,
        uint256 networkTokenTradingLiquidityDelta
    ) private {
        Pool storage pool = _pools[baseToken];
        uint256 totalSupply = pool.poolToken.totalSupply();

        uint256 baseTokenCurrTradingLiquidity = pool.baseTokenTradingLiquidity;
        uint256 networkTokenCurrTradingLiquidity = pool.networkTokenTradingLiquidity;
        uint256 baseTokenNextTradingLiquidity = baseTokenCurrTradingLiquidity.sub(baseTokenTradingLiquidityDelta);
        uint256 networkTokenNextTradingLiquidity = networkTokenCurrTradingLiquidity.sub(networkTokenTradingLiquidityDelta);

        pool.poolToken.burnFrom(address(_network), basePoolTokenAmount);
        pool.stakedBalance = MathEx.mulDivF(pool.stakedBalance, totalSupply - basePoolTokenAmount, totalSupply);
        pool.baseTokenTradingLiquidity = uint128(baseTokenNextTradingLiquidity);
        pool.networkTokenTradingLiquidity = uint128(networkTokenNextTradingLiquidity);
        pool.tradingLiquidityProduct = baseTokenNextTradingLiquidity * networkTokenNextTradingLiquidity;

        if (pool.tradingEnabled) {
            uint256 minLiquidityForTrading = _settings.minLiquidityForTrading();
            bool currEnabled = networkTokenCurrTradingLiquidity >= minLiquidityForTrading;
            bool nextEnabled = networkTokenNextTradingLiquidity >= minLiquidityForTrading;
            if (nextEnabled != currEnabled) {
                emit TradingEnabled(baseToken, nextEnabled);
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
    function withdrawalAmounts(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 w,
        uint256 m,
        uint256 n,
        uint256 x
    ) internal pure returns (WithdrawalAmounts memory amounts) {
        uint256 bPc = b.add(c);

        if (e > bPc) {
            uint256 f = deductFee(e - bPc, x, d, n);
            amounts.E = f < w ? f : w;
            (x, d, e) = reviseInput(amounts.E, x, d, e, n);
        }

        uint256 eMx = e.mul(x);

        amounts.B = deductFee(1, eMx, d, n);
        amounts.D = deductFee(b, eMx, d.mul(bPc), n);
        amounts.F = deductFee(a, eMx, d.mul(bPc), 0);

        if (bPc >= e) {
            // the pool is not in a base-token deficit
            uint256 f = deductFee(bPc - e, x, d, n);
            amounts.G = posArbitrage(cap(a, amounts.F), cap(b, amounts.D), d, f, m, n, eMx);
            if (amounts.G > 0) {
                amounts.H = Action.burnNetworkTokens;
            }
        } else {
            // the pool is in a base-token deficit
            if (amounts.B <= bPc) {
                uint256 f = deductFee(e - bPc, x, d, n);
                amounts.G = negArbitrage(cap(a, amounts.F), cap(b, amounts.D), d, f, m, n, eMx);
                if (amounts.G > 0) {
                    amounts.H = Action.mintNetworkTokens;
                }
            }
            if (amounts.H == Action.noArbitrage) {
                // the withdrawal amount is larger than the vault's balance
                uint256 aMx = a.mul(x);
                uint256 bMd = b.mul(d);
                amounts.C = deductFee(e - bPc, aMx, bMd, n);
                amounts.B = deductFee(bPc, x, d, n);
                amounts.D = deductFee(b, x, d, n);
                amounts.F = deductFee(a, x, d, 0);
            }
        }
    }

    /**
     * @dev returns `xy(1-n) / z`, pretending `n` is normalized
     */
    function deductFee(
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
     * input:
     * E = base token amount to transfer from the protection wallet to the user
     * x = base pool token withdrawal amount
     * d = base pool token total supply
     * e = base token staked amount
     * n = withdrawal fee in ppm units
     *
     * output, pretending `n` is normalized:
     * x - E / (1 - n) * d / e
     * d - E / (1 - n) * d / e
     * e - E / (1 - n)
     */
    function reviseInput(
        uint256 E,
        uint256 x,
        uint256 d,
        uint256 e,
        uint256 n
    )
        internal
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 g = MathEx.mulDivF(E, PPM_RESOLUTION, PPM_RESOLUTION - n);
        uint256 h = MathEx.mulDivF(g, d, e);
        return (x.sub(h), d.sub(h), e.sub(g));
    }

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
     * output, pretending `m` and `n` are normalized:
     * if `f(f + bm - 2fm) / (b - fm) <  exn / d` return `af(b(2 - m) - f) / (b(b - fm))`
     * if `f(f + bm - 2fm) / (b - fm) >= exn / d` return `0`
     */
    function posArbitrage(
        uint256 a,
        uint256 b,
        uint256 d,
        uint256 f,
        uint256 m,
        uint256 n,
        uint256 ex
    ) internal pure returns (uint256) {
        return calcArbitrage(a, b, d, f, n, ex, posArbitrage(b, f, m));
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
     * output, pretending `m` and `n` are normalized:
     * if `f(f - bm - 2fm) / (b + fm) <  exn / d` return `af(b(2 - m) + f) / (b(b + fm))`
     * if `f(f - bm - 2fm) / (b + fm) >= exn / d` return `0`
     */
    function negArbitrage(
        uint256 a,
        uint256 b,
        uint256 d,
        uint256 f,
        uint256 m,
        uint256 n,
        uint256 ex
    ) internal pure returns (uint256) {
        return calcArbitrage(a, b, d, f, n, ex, negArbitrage(b, f, m));
    }

    /**
     * @dev returns the following quotients, pretending `m` is normalized:
     * 1. `(f + bm - 2fm) / (b - fm)`
     * 2. `(2b - bm - f) / (b - fm)`
     */
    function posArbitrage(
        uint256 b,
        uint256 f,
        uint256 m
    ) internal pure returns (Quotient[2] memory) {
        uint256 bm = b.mul(m);
        uint256 fm = f.mul(m);
        uint256 bM = b.mul(PPM_RESOLUTION);
        uint256 fM = f.mul(PPM_RESOLUTION);
        return [
            Quotient({ n1: fM.add(bm), n2: fm.mul(2), d1: bM, d2: fm }),
            Quotient({ n1: b.mul(2 * PPM_RESOLUTION - m), n2: fM, d1: bM, d2: fm })
        ];
    }

    /**
     * @dev returns the following quotients, pretending `m` is normalized:
     * 1. `(f - bm - 2fm) / (b + fm)`
     * 2. `(2b - bm + f) / (b + fm)`
     */
    function negArbitrage(
        uint256 b,
        uint256 f,
        uint256 m
    ) internal pure returns (Quotient[2] memory) {
        uint256 bm = b.mul(m);
        uint256 fm = f.mul(m);
        uint256 bM = b.mul(PPM_RESOLUTION);
        uint256 fM = f.mul(PPM_RESOLUTION);
        return [
            Quotient({ n1: fM, n2: bm.add(fm.mul(2)), d1: bM.add(fm), d2: 0 }),
            Quotient({ n1: b.mul(2 * PPM_RESOLUTION - m).add(fM), n2: 0, d1: bM.add(fm), d2: 0 })
        ];
    }

    /**
     * @dev returns the arbitrage if it is smaller than the fee paid, and 0 otherwise
     */
    function calcArbitrage(
        uint256 a,
        uint256 b,
        uint256 d,
        uint256 f,
        uint256 n,
        uint256 ex,
        Quotient[2] memory quotients
    ) internal pure returns (uint256) {
        Fraction memory y = cap(quotients[0]);
        if (MathEx.mulDivF(f, y.n, y.d) < MathEx.mulDivF(ex, n, d.mul(PPM_RESOLUTION))) {
            Fraction memory z = cap(quotients[1]);
            return MathEx.mulDivF(a.mul(f), z.n, b.mul(z.d));
        }
        return 0;
    }

    /**
     * @dev returns the maximum of `n1 - n2` and 0
     */
    function cap(uint256 n1, uint256 n2) internal pure returns (uint256) {
        return n1 > n2 ? n1 - n2 : 0;
    }

    /**
     * @dev returns the maximum of `(q.n1 - q.n2) / (q.d1 - q.d2)` and 0
     */
    function cap(Quotient memory q) internal pure returns (Fraction memory) {
        if (q.n1 > q.n2 && q.d1 > q.d2) {
            // the quotient is positive
            return Fraction({ n: q.n1 - q.n2, d: q.d1 - q.d2 });
        }
        if (q.n2 > q.n1 && q.d2 > q.d1) {
            // the quotient is positive
            return Fraction({ n: q.n2 - q.n1, d: q.d2 - q.d1 });
        }
        // the quotient is not positive
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

        emit DefaultTradingFeePPMUpdated(prevDefaultTradingFeePPM, newDefaultTradingFeePPM);
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

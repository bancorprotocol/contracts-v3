// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../utility/Constants.sol";
import "../utility/OwnedUpgradeable.sol";
import "../utility/Utils.sol";
import "../utility/MathEx.sol";

import "./interfaces/ILiquidityPoolCollection.sol";

import "./PoolToken.sol";

/**
 * @dev Liquidity Pool Collection contract
 *
 * notes:
 *
 * - in Bancor V3, the address of reserve token serves as the pool unique ID in both contract functions and events
 */
contract LiquidityPoolCollection is ILiquidityPoolCollection, OwnedUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using SafeMath for uint256;
    using MathEx for *;

    uint32 private constant DEFAULT_TRADING_FEE_PPM = 2000; // 0.2%

    string private constant POOL_TOKEN_SYMBOL_PREFIX = "bn";
    string private constant POOL_TOKEN_NAME_PREFIX = "Bancor";
    string private constant POOL_TOKEN_NAME_SUFFIX = "Pool Token";

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the network contract
    IBancorNetwork private immutable _network;

    // a mapping between reserve tokens and their pools
    mapping(IReserveToken => Pool) private _pools;

    // a mapping between reserve tokens and custom symbol overrides (only needed for tokens with malformed symbol property)
    mapping(IReserveToken => string) private _tokenSymbolOverrides;

    // the default trading fee (in units of PPM)
    uint32 private _defaultTradingFeePPM = DEFAULT_TRADING_FEE_PPM;

    /**
     * @dev triggered when a pool is created
     */
    event PoolCreated(IPoolToken indexed poolToken, IReserveToken indexed reserveToken);

    /**
     * @dev triggered when the default trading fee is updated
     */
    event DefaultTradingFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when a pool's initial rate is updated
     */
    event InitialRateUpdated(IReserveToken indexed pool, Fraction prevRate, Fraction newRate);

    /**
     * @dev triggered when a specific pool's trading fee is updated
     */
    event TradingFeePPMUpdated(IReserveToken indexed pool, uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when deposits to a specific pool are enabled/disabled
     */
    event DepositsEnabled(IReserveToken indexed pool, bool prevStatus, bool newStatus);

    /**
     * @dev triggered when a pool's deposit limit is updated
     */
    event DepositLimitUpdated(IReserveToken indexed pool, uint256 prevDepositLimit, uint256 newDepositLimit);

    /**
     * @dev triggered when trades in a specific pool are enabled/disabled
     */
    event TradesEnabled(IReserveToken indexed pool, bool status);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IBancorNetwork initNetwork) validAddress(address(initNetwork)) {
        __Owned_init();
        __ReentrancyGuard_init();

        _network = initNetwork;
        _settings = initNetwork.settings();
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
     * @inheritdoc ILiquidityPoolCollection
     */
    function poolType() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function settings() external view override returns (INetworkSettings) {
        return _settings;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function network() external view override returns (IBancorNetwork) {
        return _network;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
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
     * @inheritdoc ILiquidityPoolCollection
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
        emit DefaultTradingFeePPMUpdated(_defaultTradingFeePPM, newDefaultTradingFeePPM);

        _defaultTradingFeePPM = newDefaultTradingFeePPM;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function createPool(IReserveToken reserveToken) external override onlyNetwork nonReentrant {
        require(_settings.isTokenWhitelisted(reserveToken), "ERR_POOL_NOT_WHITELISTED");
        require(!_validPool(_pools[reserveToken]), "ERR_POOL_ALREADY_EXISTS");

        (string memory name, string memory symbol) = _poolTokenMetadata(reserveToken);
        PoolToken newPoolToken = new PoolToken(name, symbol, reserveToken);

        _pools[reserveToken] = Pool({
            poolToken: newPoolToken,
            tradingFeePPM: DEFAULT_TRADING_FEE_PPM,
            depositsEnabled: true,
            tradingLiquidity: 0,
            tradingLiquidityProduct: 0,
            stakedBalance: 0,
            initialRate: Fraction({ n: 0, d: 1 }),
            depositLimit: 0
        });

        emit PoolCreated(newPoolToken, reserveToken);
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function poolToken(IReserveToken reserveToken) external view override returns (IPoolToken) {
        return _pools[reserveToken].poolToken;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function tradingFeePPM(IReserveToken reserveToken) external view override returns (uint32) {
        return _pools[reserveToken].tradingFeePPM;
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

        emit TradingFeePPMUpdated(pool, p.tradingFeePPM, newTradingFeePPM);

        p.tradingFeePPM = newTradingFeePPM;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function depositsEnabled(IReserveToken reserveToken) external view override returns (bool) {
        return _pools[reserveToken].depositsEnabled;
    }

    /**
     * @dev enables/disables deposits to a given pool
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableDeposits(IReserveToken pool, bool status) external onlyOwner {
        Pool storage p = _poolStorage(pool);

        emit DepositsEnabled(pool, p.depositsEnabled, status);

        p.depositsEnabled = status;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function tradingLiquidity(IReserveToken reserveToken) external view override returns (uint256, uint256) {
        uint256 rawTradingLiquidity = _pools[reserveToken].tradingLiquidity;
        return (_decodeUint128(rawTradingLiquidity, 0), _decodeUint128(rawTradingLiquidity, 1));
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function stakedBalance(IReserveToken reserveToken) external view override returns (uint256) {
        return _pools[reserveToken].stakedBalance;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function initialRate(IReserveToken reserveToken) external view override returns (Fraction memory) {
        return _pools[reserveToken].initialRate;
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

        emit InitialRateUpdated(pool, p.initialRate, newInitialRate);

        p.initialRate = newInitialRate;
    }

    /**
     * @inheritdoc ILiquidityPoolCollection
     */
    function depositLimit(IReserveToken reserveToken) external view override returns (uint256) {
        return _pools[reserveToken].depositLimit;
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

        emit DepositLimitUpdated(pool, p.depositLimit, newDepositLimit);

        p.depositLimit = newDepositLimit;
    }

    /**
     * @dev returns the arbitrage value in units of the base token
     *
     * input:
     * b = the hypothetical balance of the pool in the base token
     * f = the amount of base tokens required for arbitrage settlement
     * m = trade fee in ppm units
     *
     * output (pretending `m` is normalized):
     * f(f - bm - 2fm) / (fm + b)
     */
    function baseArbitrage(
        uint256 baseBalance,
        uint256 baseAmount,
        uint256 tradeFee
    ) internal pure returns (uint256) {
        uint256 b = baseBalance;
        uint256 f = baseAmount;
        uint256 m = tradeFee;
        uint256 bm = b.mul(m);
        uint256 fm = f.mul(m);
        uint256 bM = b.mul(PPM_RESOLUTION);
        uint256 fM = f.mul(PPM_RESOLUTION);
        return MathEx.mulDivF(f, fM.sub(bm).sub(fm.mul(2)), fm.add(bM));
    }

    /**
     * @dev returns the amount of network tokens which should be added
     * to the pool in order to create an optimal arbitrage incentive
     *
     * input:
     * a = the hypothetical balance of the pool in the network token
     * b = the hypothetical balance of the pool in the base token
     * f = the amount of base tokens required for arbitrage settlement
     * m = trade fee in ppm units
     *
     * output (pretending `m` is normalized):
     * af(b(2 - m) + f) / (b(b + fm))
     */
    function networkArbitrage(
        uint256 networkBalance,
        uint256 baseBalance,
        uint256 baseAmount,
        uint256 tradeFee
    ) internal pure returns (uint256) {
        uint256 a = networkBalance;
        uint256 b = baseBalance;
        uint256 f = baseAmount;
        uint256 m = tradeFee;
        uint256 af = a.mul(f);
        uint256 fm = f.mul(m);
        uint256 bM = b.mul(PPM_RESOLUTION);
        uint256 fM = f.mul(PPM_RESOLUTION);
        return MathEx.mulDivF(af, b.mul(2 * PPM_RESOLUTION - m).add(fM), b.mul(bM.add(fm)));
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

    /**
     * @dev decodes the uint128 from a single uint256 variable and returns it as uint256
     */
    function _decodeUint128(uint256 data, uint256 index) private pure returns (uint256) {
        assert(index <= 1);
        return (data >> (index * 128)) & MAX_UINT128;
    }
}

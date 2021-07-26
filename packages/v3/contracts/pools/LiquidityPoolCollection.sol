// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../utility/OwnedUpgradeable.sol";
import "../utility/Utils.sol";
import "../utility/MathEx.sol";

import "./interfaces/ILiquidityPoolCollection.sol";

/**
 * @dev Liquidity Pool Collection contract
 *
 * notes:
 *
 * - in Bancor V3, the address of reserve token serves as the pool unique ID in both contract functions and events
 */
contract LiquidityPoolCollection is ILiquidityPoolCollection, OwnedUpgradeable, Utils {
    using SafeMath for uint256;
    using MathEx for *;

    struct ArbitrageAmounts {
        uint256 tkn;
        uint256 bnt;
    }

    uint32 private constant DEFAULT_TRADING_FEE_PPM = 2000; // 0.2%

    // the network contract
    IBancorNetwork private immutable _network;

    // a mapping between reserve tokens and their pools
    mapping(IReserveToken => Pool) private _pools;

    // a mapping between reserve tokens and custom symbol overrides (only needed for tokens with malformed symbol property)
    mapping(IReserveToken => string) private _tokenSymbolOverrides;

    // the default trading fee (in units of PPM)
    uint32 private _defaultTradingFeePPM = DEFAULT_TRADING_FEE_PPM;

    /**
     * @dev triggered when the trading fee is updated
     */
    event DefaultTradingFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when a pool's initial rate is updated
     */
    event InitialRateUpdated(IReserveToken indexed pool, Fraction prevRate, Fraction newRate);

    /**
     * @dev triggered when trades in a specific pool are enabled/disabled
     */
    event TradesEnabled(IReserveToken indexed pool, bool status);

    /**
     * @dev triggered when deposits to a specific pool are enabled/disabled
     */
    event DepositsEnabled(IReserveToken indexed pool, bool status);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IBancorNetwork initNetwork) validAddress(address(initNetwork)) {
        __Owned_init();

        _network = initNetwork;
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
    function pool(IReserveToken reserveToken) external view override returns (Pool memory) {
        return _pools[reserveToken];
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
     * @dev returns the TKN arbitrage value
     *
     * input:
     * b = TKN hypothetical pool balance
     * f = TKN settlement amount
     * m = trade fee in ppm units
     *
     * output (pretending `m` is normalized):
     * f(f - bm - 2fm) / (fm + b)
     */
    function tknArbitrage(
        uint256 tknBalance,
        uint256 tknAmount,
        uint256 tradeFee
    ) internal pure returns (uint256) {
        uint256 b = tknBalance;
        uint256 f = tknAmount;
        uint256 m = tradeFee;
        uint256 bm = b.mul(m);
        uint256 fm = f.mul(m);
        uint256 bM = b.mul(PPM_RESOLUTION);
        uint256 fM = f.mul(PPM_RESOLUTION);
        return MathEx.mulDivF(f, fM.sub(bm).sub(fm.mul(2)), fm.add(bM));
    }

    /**
     * @dev returns the BNT amount which should be added to
     * the pool in order to create an optimal arbitrage incentive
     *
     * input:
     * a = BNT hypothetical pool balance
     * b = TKN hypothetical pool balance
     * f = TKN settlement amount
     * m = trade fee in ppm units
     *
     * output (pretending `m` is normalized):
     * af(b(2 - m) + f) / (b(b + fm))
     */
    function bntArbitrage(
        uint256 bntBalance,
        uint256 tknBalance,
        uint256 tknAmount,
        uint256 tradeFee
    ) internal pure returns (uint256) {
        uint256 a = bntBalance;
        uint256 b = tknBalance;
        uint256 f = tknAmount;
        uint256 m = tradeFee;
        uint256 af = a.mul(f);
        uint256 fm = f.mul(m);
        uint256 bM = b.mul(PPM_RESOLUTION);
        uint256 fM = f.mul(PPM_RESOLUTION);
        return MathEx.mulDivF(af, b.mul(2 * PPM_RESOLUTION - m).add(fM), b.mul(bM.add(fm)));
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AlreadyExists, DoesNotExist, InvalidParam } from "../utility/Utils.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { INetworkSettings, VortexRewards, NotWhitelisted } from "./interfaces/INetworkSettings.sol";

/**
 * @dev Network Settings contract
 */
contract NetworkSettings is INetworkSettings, Upgradeable, Utils {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using TokenLibrary for Token;

    uint32 private constant DEFAULT_FLASH_LOAN_FEE_PPM = 0; // 0%

    struct FlashLoanFee {
        bool initialized;
        uint32 feePPM;
    }

    // the address of the BNT token
    IERC20 private immutable _bnt;

    // a set of tokens which are eligible for protection
    EnumerableSetUpgradeable.AddressSet private _protectedTokenWhitelist;

    // a mapping of BNT funding limits per pool
    mapping(Token => uint256) private _poolFundingLimits;

    // below that amount, trading is disabled and co-investments use the initial rate
    uint256 private _minLiquidityForTrading;

    // DEPRECATED (uint32 private _networkFeePPM)
    uint32 private _deprecated0;

    // the withdrawal fee (in units of PPM)
    uint32 private _withdrawalFeePPM;

    // the default flash-loan fee (in units of PPM)
    uint32 private _defaultFlashLoanFeePPM;

    // the settings of the Vortex
    VortexRewards private _vortexRewards;

    // a mapping between pools and their flash-loan fees
    mapping(Token => FlashLoanFee) private _flashLoanFees;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 8] private __gap;

    /**
     * @dev triggered when a token is added to the protection whitelist
     */
    event TokenAddedToWhitelist(Token indexed token);

    /**
     * @dev triggered when a token is removed from the protection whitelist
     */
    event TokenRemovedFromWhitelist(Token indexed token);

    /**
     * @dev triggered when a per-pool funding limit is updated
     */
    event FundingLimitUpdated(Token indexed pool, uint256 prevLimit, uint256 newLimit);

    /**
     * @dev triggered when the minimum liquidity for trading is updated
     */
    event MinLiquidityForTradingUpdated(uint256 prevLiquidity, uint256 newLiquidity);

    /**
     * @dev triggered when the withdrawal fee is updated
     */
    event WithdrawalFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when the settings of the Vortex are updated
     */
    event VortexBurnRewardUpdated(
        uint32 prevBurnRewardPPM,
        uint32 newBurnRewardPPM,
        uint256 prevBurnRewardMaxAmount,
        uint256 newBurnRewardMaxAmount
    );

    /**
     * @dev triggered when the default flash-loan fee is updated
     */
    event DefaultFlashLoanFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when a specific pool's flash-loan fee is updated
     */
    event FlashLoanFeePPMUpdated(Token indexed pool, uint32 prevFeePPM, uint32 newFeePPM);

    constructor(IERC20 initBnt) validAddress(address(initBnt)) {
        _bnt = initBnt;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __NetworkSettings_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __NetworkSettings_init() internal onlyInitializing {
        __Upgradeable_init();

        __NetworkSettings_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __NetworkSettings_init_unchained() internal onlyInitializing {
        _setDefaultFlashLoanFeePPM(DEFAULT_FLASH_LOAN_FEE_PPM);
    }

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 3;
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function protectedTokenWhitelist() external view returns (Token[] memory) {
        uint256 length = _protectedTokenWhitelist.length();
        Token[] memory list = new Token[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = Token(_protectedTokenWhitelist.at(i));
        }
        return list;
    }

    /**
     * @dev adds a token to the protected tokens whitelist
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function addTokenToWhitelist(Token token) external onlyAdmin {
        _addTokenToWhitelist(token);
    }

    /**
     * @dev adds tokens to the protected tokens whitelist
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function addTokensToWhitelist(Token[] calldata tokens) external onlyAdmin {
        uint256 length = tokens.length;

        for (uint256 i = 0; i < length; i++) {
            _addTokenToWhitelist(tokens[i]);
        }
    }

    /**
     * @dev adds a token to the protected tokens whitelist
     */
    function _addTokenToWhitelist(Token token) private validExternalAddress(address(token)) {
        if (!_protectedTokenWhitelist.add(address(token))) {
            revert AlreadyExists();
        }

        emit TokenAddedToWhitelist({ token: token });
    }

    /**
     * @dev removes a token from the protected tokens whitelist
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function removeTokenFromWhitelist(Token token) external onlyAdmin {
        if (!_protectedTokenWhitelist.remove(address(token))) {
            revert DoesNotExist();
        }

        emit TokenRemovedFromWhitelist({ token: token });
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function isTokenWhitelisted(Token token) external view returns (bool) {
        return _isTokenWhitelisted(token);
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function poolFundingLimit(Token pool) external view returns (uint256) {
        return _poolFundingLimits[pool];
    }

    /**
     * @dev updates the amount of BNT that the protocol can provide as funding for a specific pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the token must have been whitelisted
     */
    function setFundingLimit(Token pool, uint256 amount) external onlyAdmin {
        _setFundingLimit(pool, amount);
    }

    /**
     * @dev updates the amounts of BNT that the protocol can provide as funding for specific pools
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - each one of the tokens must have been whitelisted
     */
    function setFundingLimits(Token[] calldata pools, uint256[] calldata amounts) external onlyAdmin {
        uint256 length = pools.length;
        if (length != amounts.length) {
            revert InvalidParam();
        }

        for (uint256 i = 0; i < length; i++) {
            _setFundingLimit(pools[i], amounts[i]);
        }
    }

    /**
     * @dev updates the amount of BNT that the protocol can provide as funding for a specific pool
     */
    function _setFundingLimit(Token pool, uint256 amount) private validAddress(address(pool)) {
        if (!_isTokenWhitelisted(pool)) {
            revert NotWhitelisted();
        }

        uint256 prevPoolFundingLimit = _poolFundingLimits[pool];
        if (prevPoolFundingLimit == amount) {
            return;
        }

        _poolFundingLimits[pool] = amount;

        emit FundingLimitUpdated({ pool: pool, prevLimit: prevPoolFundingLimit, newLimit: amount });
    }

    /**
     * @dev adds a token to the protected tokens whitelist,
     * and sets the amount of BNT that the protocol can provide as funding for this pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function addTokenToWhitelistWithLimit(Token token, uint256 amount) external onlyAdmin {
        _addTokenToWhitelist(token);
        _setFundingLimit(token, amount);
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function minLiquidityForTrading() external view returns (uint256) {
        return _minLiquidityForTrading;
    }

    /**
     * @dev updates the minimum liquidity for trading amount
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setMinLiquidityForTrading(uint256 amount) external onlyAdmin {
        uint256 prevMinLiquidityForTrading = _minLiquidityForTrading;
        if (_minLiquidityForTrading == amount) {
            return;
        }

        _minLiquidityForTrading = amount;

        emit MinLiquidityForTradingUpdated({ prevLiquidity: prevMinLiquidityForTrading, newLiquidity: amount });
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function withdrawalFeePPM() external view returns (uint32) {
        return _withdrawalFeePPM;
    }

    /**
     * @dev sets the withdrawal fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setWithdrawalFeePPM(uint32 newWithdrawalFeePPM) external onlyAdmin validFee(newWithdrawalFeePPM) {
        uint32 prevWithdrawalFeePPM = _withdrawalFeePPM;
        if (prevWithdrawalFeePPM == newWithdrawalFeePPM) {
            return;
        }

        _withdrawalFeePPM = newWithdrawalFeePPM;

        emit WithdrawalFeePPMUpdated({ prevFeePPM: prevWithdrawalFeePPM, newFeePPM: newWithdrawalFeePPM });
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function defaultFlashLoanFeePPM() external view returns (uint32) {
        return _defaultFlashLoanFeePPM;
    }

    /**
     * @dev sets the default flash-loan fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setDefaultFlashLoanFeePPM(
        uint32 newDefaultFlashLoanFeePPM
    ) external onlyAdmin validFee(newDefaultFlashLoanFeePPM) {
        _setDefaultFlashLoanFeePPM(newDefaultFlashLoanFeePPM);
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function flashLoanFeePPM(Token pool) external view returns (uint32) {
        FlashLoanFee memory flashLoanFee = _flashLoanFees[pool];

        return flashLoanFee.initialized ? flashLoanFee.feePPM : _defaultFlashLoanFeePPM;
    }

    /**
     * @dev sets the flash-loan fee of a given pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the token must have been whitelisted
     */
    function setFlashLoanFeePPM(Token pool, uint32 newFlashLoanFeePPM) external onlyAdmin validFee(newFlashLoanFeePPM) {
        if (!pool.isEqual(_bnt) && !_isTokenWhitelisted(pool)) {
            revert NotWhitelisted();
        }

        uint32 prevFlashLoanFeePPM = _flashLoanFees[pool].feePPM;
        if (prevFlashLoanFeePPM == newFlashLoanFeePPM) {
            return;
        }

        _flashLoanFees[pool] = FlashLoanFee({ initialized: true, feePPM: newFlashLoanFeePPM });

        emit FlashLoanFeePPMUpdated({ pool: pool, prevFeePPM: prevFlashLoanFeePPM, newFeePPM: newFlashLoanFeePPM });
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function vortexRewards() external view returns (VortexRewards memory) {
        return _vortexRewards;
    }

    /**
     * @dev sets the settings of the Vortex
     *
     * requirements:
     *s
     * - the caller must be the admin of the contract
     */
    function setVortexRewards(
        VortexRewards calldata rewards
    ) external onlyAdmin validFee(rewards.burnRewardPPM) greaterThanZero(rewards.burnRewardMaxAmount) {
        uint32 prevVortexBurnRewardPPM = _vortexRewards.burnRewardPPM;
        uint256 prevVortexBurnRewardMaxAmount = _vortexRewards.burnRewardMaxAmount;

        if (
            prevVortexBurnRewardPPM == rewards.burnRewardPPM &&
            prevVortexBurnRewardMaxAmount == rewards.burnRewardMaxAmount
        ) {
            return;
        }

        _vortexRewards = rewards;

        emit VortexBurnRewardUpdated({
            prevBurnRewardPPM: prevVortexBurnRewardPPM,
            newBurnRewardPPM: rewards.burnRewardPPM,
            prevBurnRewardMaxAmount: prevVortexBurnRewardMaxAmount,
            newBurnRewardMaxAmount: rewards.burnRewardMaxAmount
        });
    }

    /**
     * @dev checks whether a given token is whitelisted
     */
    function _isTokenWhitelisted(Token token) private view returns (bool) {
        return _protectedTokenWhitelist.contains(address(token));
    }

    /**
     * @dev sets the default flash-loan fee (in units of PPM)
     */
    function _setDefaultFlashLoanFeePPM(uint32 newDefaultFlashLoanFeePPM) private {
        uint32 prevDefaultFlashLoanFeePPM = _defaultFlashLoanFeePPM;
        if (prevDefaultFlashLoanFeePPM == newDefaultFlashLoanFeePPM) {
            return;
        }

        _defaultFlashLoanFeePPM = newDefaultFlashLoanFeePPM;

        emit DefaultFlashLoanFeePPMUpdated({
            prevFeePPM: prevDefaultFlashLoanFeePPM,
            newFeePPM: newDefaultFlashLoanFeePPM
        });
    }
}

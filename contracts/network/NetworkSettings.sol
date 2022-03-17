// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AlreadyExists, DoesNotExist } from "../utility/Utils.sol";

import { Token } from "../token/Token.sol";

import { INetworkSettings, VortexRewards, NotWhitelisted } from "./interfaces/INetworkSettings.sol";

/**
 * @dev Network Settings contract
 */
contract NetworkSettings is INetworkSettings, Upgradeable, Utils {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // a set of tokens which are eligible for protection
    EnumerableSetUpgradeable.AddressSet private _protectedTokenWhitelist;

    // a mapping of BNT funding limits per pool
    mapping(Token => uint256) private _poolFundingLimits;

    // below that amount, trading is disabled and co-investments use the initial rate
    uint256 private _minLiquidityForTrading;

    // the fee (in units of PPM)
    uint32 private _networkFeePPM;

    // the withdrawal fee (in units of PPM)
    uint32 private _withdrawalFeePPM;

    // the flash-loan fee (in units of PPM)
    uint32 private _flashLoanFeePPM;

    // the settings of the Vortex
    VortexRewards private _vortexRewards;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 7] private __gap;

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
     * @dev triggered when the network fee is updated
     */
    event NetworkFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when the withdrawal fee is updated
     */
    event WithdrawalFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when the flash-loan fee is updated
     */
    event FlashLoanFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

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
    function __NetworkSettings_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc IVersioned
     */
    function version() external pure returns (uint16) {
        return 1;
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
    function addTokenToWhitelist(Token token) external onlyAdmin validExternalAddress(address(token)) {
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
     * @dev updates the amount of BNT that the protocol can fund a specific pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the token must have been whitelisted
     */
    function setFundingLimit(Token pool, uint256 amount) external onlyAdmin validAddress(address(pool)) {
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
    function networkFeePPM() external view returns (uint32) {
        return _networkFeePPM;
    }

    /**
     * @dev sets the network fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setNetworkFeePPM(uint32 newNetworkFeePPM) external onlyAdmin validFee(newNetworkFeePPM) {
        uint32 prevNetworkFeePPM = _networkFeePPM;
        if (prevNetworkFeePPM == newNetworkFeePPM) {
            return;
        }

        _networkFeePPM = newNetworkFeePPM;

        emit NetworkFeePPMUpdated({ prevFeePPM: prevNetworkFeePPM, newFeePPM: newNetworkFeePPM });
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
    function flashLoanFeePPM() external view returns (uint32) {
        return _flashLoanFeePPM;
    }

    /**
     * @dev sets the flash-loan fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setFlashLoanFeePPM(uint32 newFlashLoanFeePPM) external onlyAdmin validFee(newFlashLoanFeePPM) {
        uint32 prevFlashLoanFeePPM = _flashLoanFeePPM;
        if (prevFlashLoanFeePPM == newFlashLoanFeePPM) {
            return;
        }

        _flashLoanFeePPM = newFlashLoanFeePPM;

        emit FlashLoanFeePPMUpdated({ prevFeePPM: prevFlashLoanFeePPM, newFeePPM: newFlashLoanFeePPM });
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
    function setVortexRewards(VortexRewards calldata rewards)
        external
        onlyAdmin
        validFee(rewards.burnRewardPPM)
        greaterThanZero(rewards.burnRewardMaxAmount)
    {
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
}

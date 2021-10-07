// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import { ITokenHolder } from "../utility/interfaces/ITokenHolder.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AlreadyExists, DoesNotExist } from "../utility/Utils.sol";
import { uncheckedInc } from "../utility/MathEx.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

import { INetworkSettings } from "./interfaces/INetworkSettings.sol";

/**
 * @dev Network Settings contract
 */
contract NetworkSettings is INetworkSettings, Upgradeable, Utils {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // a set of tokens which are eligeble for protection
    EnumerableSetUpgradeable.AddressSet private _protectedTokenWhitelist;

    // a mapping of network token minting limits per pool
    mapping(ReserveToken => uint256) private _poolMintingLimits;

    // below that amount, trading is disabled and co-investments use the initial rate
    uint256 private _minLiquidityForTrading;

    // the address of the network fee wallet, and the fee (in units of PPM)
    ITokenHolder private _networkFeeWallet;
    uint32 private _networkFeePPM;

    // the withdrawal fee (in units of PPM)
    uint32 private _withdrawalFeePPM;

    // the flash-loan fee (in units of PPM)
    uint32 private _flashLoanFeePPM;

    // maximum deviation of the average rate from the spot rate (in units of PPM)
    uint32 private _averageRateMaxDeviationPPM;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 6] private __gap;

    /**
     * @dev triggered when a token is added to the protection whitelist
     */
    event TokenAddedToWhitelist(ReserveToken indexed token);

    /**
     * @dev triggered when a token is removed from the protection whitelist
     */
    event TokenRemovedFromWhitelist(ReserveToken indexed token);

    /**
     * @dev triggered when a per-pool minting limit is updated
     */
    event PoolMintingLimitUpdated(ReserveToken indexed pool, uint256 prevLimit, uint256 newLimit);

    /**
     * @dev triggered when the minimum liquidity for trading is updated
     */
    event MinLiquidityForTradingUpdated(uint256 prevLiquidity, uint256 newLiquidity);

    /**
     * @dev triggered when the network fee is updated
     */
    event NetworkFeeWalletUpdated(ITokenHolder prevWallet, ITokenHolder newWallet);

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
     * @dev triggered when the maximum deviation of the average rate from the spot rate  is updated
     */
    event AverageRateMaxDeviationPPMUpdated(uint32 prevDeviationPPM, uint32 newDeviationPPM);

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
    function __NetworkSettings_init() internal initializer {
        __Upgradeable_init();

        __NetworkSettings_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __NetworkSettings_init_unchained() internal initializer {}

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function protectedTokenWhitelist() external view override returns (ReserveToken[] memory) {
        uint256 length = _protectedTokenWhitelist.length();
        ReserveToken[] memory list = new ReserveToken[](length);
        for (uint256 i = 0; i < length; i = uncheckedInc(i)) {
            list[i] = ReserveToken.wrap(_protectedTokenWhitelist.at(i));
        }
        return list;
    }

    /**
     * @dev adds a token to the protected tokens whitelist
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function addTokenToWhitelist(ReserveToken token)
        external
        onlyOwner
        validExternalAddress(ReserveToken.unwrap(token))
    {
        if (!_protectedTokenWhitelist.add(ReserveToken.unwrap(token))) {
            revert AlreadyExists();
        }

        emit TokenAddedToWhitelist({ token: token });
    }

    /**
     * @dev removes a token from the protected tokens whitelist
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function removeTokenFromWhitelist(ReserveToken token) external onlyOwner {
        if (!_protectedTokenWhitelist.remove(ReserveToken.unwrap(token))) {
            revert DoesNotExist();
        }

        emit TokenRemovedFromWhitelist({ token: token });
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function isTokenWhitelisted(ReserveToken token) external view override returns (bool) {
        return _protectedTokenWhitelist.contains(ReserveToken.unwrap(token));
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function poolMintingLimit(ReserveToken pool) external view override returns (uint256) {
        return _poolMintingLimits[pool];
    }

    /**
     * @dev updates the amount of network tokens that the system can mint into a specific pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setPoolMintingLimit(ReserveToken pool, uint256 amount)
        external
        onlyOwner
        validAddress(ReserveToken.unwrap(pool))
    {
        uint256 prevPoolMintingLimit = _poolMintingLimits[pool];
        if (prevPoolMintingLimit == amount) {
            return;
        }

        _poolMintingLimits[pool] = amount;

        emit PoolMintingLimitUpdated({ pool: pool, prevLimit: prevPoolMintingLimit, newLimit: amount });
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function minLiquidityForTrading() external view override returns (uint256) {
        return _minLiquidityForTrading;
    }

    /**
     * @dev updates the minimum liquidity for trading amount
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setMinLiquidityForTrading(uint256 amount) external onlyOwner {
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
    function networkFeeParams() external view override returns (ITokenHolder, uint32) {
        return (_networkFeeWallet, _networkFeePPM);
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function networkFeeWallet() external view override returns (ITokenHolder) {
        return _networkFeeWallet;
    }

    /**
     * @inheritdoc INetworkSettings
     */
    function networkFeePPM() external view override returns (uint32) {
        return _networkFeePPM;
    }

    /**
     * @dev sets the network fee wallet
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setNetworkFeeWallet(ITokenHolder newNetworkFeeWallet)
        external
        onlyOwner
        validAddress(address(newNetworkFeeWallet))
    {
        ITokenHolder prevNetworkFeeWallet = _networkFeeWallet;
        if (prevNetworkFeeWallet == newNetworkFeeWallet) {
            return;
        }

        _networkFeeWallet = newNetworkFeeWallet;

        emit NetworkFeeWalletUpdated({ prevWallet: prevNetworkFeeWallet, newWallet: newNetworkFeeWallet });
    }

    /**
     * @dev sets the network fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setNetworkFeePPM(uint32 newNetworkFeePPM) external onlyOwner validFee(newNetworkFeePPM) {
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
    function withdrawalFeePPM() external view override returns (uint32) {
        return _withdrawalFeePPM;
    }

    /**
     * @dev sets the withdrawal fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setWithdrawalFeePPM(uint32 newWithdrawalFeePPM) external onlyOwner validFee(newWithdrawalFeePPM) {
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
    function flashLoanFeePPM() external view override returns (uint32) {
        return _flashLoanFeePPM;
    }

    /**
     * @dev sets the flash-loan fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setFlashLoanFeePPM(uint32 newFlashLoanFeePPM) external onlyOwner validFee(newFlashLoanFeePPM) {
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
    function averageRateMaxDeviationPPM() external view override returns (uint32) {
        return _averageRateMaxDeviationPPM;
    }

    /**
     * @dev sets maximum deviation of the average rate from the spot rate (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setAverageRateMaxDeviationPPM(uint32 newAverageRateMaxDeviationPPM)
        external
        onlyOwner
        validPortion(newAverageRateMaxDeviationPPM)
    {
        uint32 prevAverageRateMaxDeviationPPM = _averageRateMaxDeviationPPM;
        if (prevAverageRateMaxDeviationPPM == newAverageRateMaxDeviationPPM) {
            return;
        }

        _averageRateMaxDeviationPPM = newAverageRateMaxDeviationPPM;

        emit AverageRateMaxDeviationPPMUpdated({
            prevDeviationPPM: prevAverageRateMaxDeviationPPM,
            newDeviationPPM: newAverageRateMaxDeviationPPM
        });
    }
}

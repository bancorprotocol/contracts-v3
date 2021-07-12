// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "../utility/OwnedUpgradeable.sol";
import "../utility/Utils.sol";

import "./interfaces/INetworkSettings.sol";

/**
 * @dev Network Settings contract
 */
contract NetworkSettings is INetworkSettings, Upgradeable, OwnedUpgradeable, Utils {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // a set of tokens which are eligeble for protection
    EnumerableSetUpgradeable.AddressSet private _protectedTokenWhitelist;

    // a mapping of network token minting limits per pool
    mapping(IReserveToken => uint256) private _poolMintingLimits;

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
    event TokenAddedToWhitelist(IReserveToken indexed token);

    /**
     * @dev triggered when a token is removed from the protection whitelist
     */
    event TokenRemovedFromWhitelist(IReserveToken indexed token);

    /**
     * @dev triggered when a per-pool minting limit is updated
     */
    event PoolMintingLimitUpdated(IReserveToken indexed token, uint256 prevLimit, uint256 newLimit);

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
        __Owned_init();

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
     * @dev returns the protected tokens whitelist
     */
    function protectedTokenWhitelist() external view override returns (IReserveToken[] memory) {
        uint256 length = _protectedTokenWhitelist.length();
        IReserveToken[] memory list = new IReserveToken[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = IReserveToken(_protectedTokenWhitelist.at(i));
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
    function addTokenToWhitelist(IReserveToken token) external onlyOwner validExternalAddress(address(token)) {
        require(_protectedTokenWhitelist.add(address(token)), "ERR_ALREADY_WHITELISTED");

        emit TokenAddedToWhitelist(token);
    }

    /**
     * @dev removes a token from the protected tokens whitelist
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function removeTokenFromWhitelist(IReserveToken token) external onlyOwner {
        require(_protectedTokenWhitelist.remove(address(token)), "ERR_NOT_WHITELISTED");

        emit TokenRemovedFromWhitelist(token);
    }

    /**
     * @dev checks whether a given token is whitelisted
     */
    function isTokenWhitelisted(IReserveToken token) external view override returns (bool) {
        return _protectedTokenWhitelist.contains(address(token));
    }

    /**
     * @dev returns the network token minting limit for a given token
     */
    function poolMintingLimit(IReserveToken token) external view override returns (uint256) {
        return _poolMintingLimits[token];
    }

    /**
     * @dev updates the amount of network tokens that the system can mint into a specific pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setPoolMintingLimit(IReserveToken token, uint256 amount) external onlyOwner validAddress(address(token)) {
        emit PoolMintingLimitUpdated(token, _poolMintingLimits[token], amount);

        _poolMintingLimits[token] = amount;
    }

    /**
     * @dev returns the network fee parameters (in units of PPM)
     */
    function networkFeeParams() external view override returns (ITokenHolder, uint32) {
        return (_networkFeeWallet, _networkFeePPM);
    }

    /**
     * @dev returns the wallet that receives the global network fees
     */
    function networkFeeWallet() external view override returns (ITokenHolder) {
        return _networkFeeWallet;
    }

    /**
     * @dev returns the global network fee (in units of PPM)
     *
     * note that the network fee is a portion of the total fees from each pool
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
        emit NetworkFeeWalletUpdated(_networkFeeWallet, newNetworkFeeWallet);

        _networkFeeWallet = newNetworkFeeWallet;
    }

    /**
     * @dev sets the network fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setNetworkFeePPM(uint32 newNetworkFeePPM) external onlyOwner validFee(newNetworkFeePPM) {
        emit NetworkFeePPMUpdated(_networkFeePPM, newNetworkFeePPM);

        _networkFeePPM = newNetworkFeePPM;
    }

    /**
     * @dev returns the withdrawal fee (in units of PPM)
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
        emit WithdrawalFeePPMUpdated(_withdrawalFeePPM, newWithdrawalFeePPM);

        _withdrawalFeePPM = newWithdrawalFeePPM;
    }

    /**
     * @dev returns the flash-loan fee (in units of PPM)
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
        emit FlashLoanFeePPMUpdated(_flashLoanFeePPM, newFlashLoanFeePPM);

        _flashLoanFeePPM = newFlashLoanFeePPM;
    }

    /**
     * @dev returns the maximum deviation of the average rate from the spot rate (in units of PPM)
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
        emit AverageRateMaxDeviationPPMUpdated(_averageRateMaxDeviationPPM, newAverageRateMaxDeviationPPM);

        _averageRateMaxDeviationPPM = newAverageRateMaxDeviationPPM;
    }
}

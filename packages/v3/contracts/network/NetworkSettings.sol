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
    EnumerableSetUpgradeable.AddressSet private _protectedTokensWhitelist;

    // a mapping of network token minting limits per pool
    mapping(IReserveToken => uint256) private _poolMintingLimits;

    // below that amount, trading is disabled and co-investments use the initial rate
    uint256 private _minLiquidityForTrading;

    // the address of the network fee wallet, and the fee (in units of PPM)
    ITokenHolder private _networkFeeWallet;
    uint32 private _networkFeePPM;

    // the withdrawal fee (in units of PPM)
    uint32 private _exitFeePPM;

    // the flashLoan fee (in units of PPM)
    uint32 private _flashLoanFeePPM;

    // maximum deviation of the average rate from the spot rate (in units of PPM)
    uint32 private _averageRateMaxDeviationPPM = 5000;

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
     * @dev triggered when a per-token minting limit is updated
     */
    event MintingLimitUpdated(IReserveToken indexed token, uint256 prevLimit, uint256 newLimit);

    /**
     * @dev triggered when the network fee is updated
     */
    event NetworkFeeWalletUpdated(ITokenHolder prevWallet, ITokenHolder newWallet);

    /**
     * @dev triggered when the network fee is updated
     */
    event NetworkFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when the exit fee is updated
     */
    event ExitFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when the flashLoan fee is updated
     */
    event FlashLoanFeePPMUpdated(uint32 prevFeePPM, uint32 newFeePPM);

    /**
     * @dev triggered when the maximum deviation of the average rate from the spot rate  is updated
     */
    event AverageRateMaxDeviationPPMUpdated(uint32 prevDeviationPPM, uint32 newDeviationPPM);

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize(
        ITokenHolder initNetworkFeeWallet,
        uint32 initNetworkFeePPM,
        uint32 initExitFeePPM,
        uint32 initFlashLoanFeePPM,
        uint32 initAverageRateMaxDeviationPPM
    ) external initializer {
        __NetworkSettings_init(
            initNetworkFeeWallet,
            initNetworkFeePPM,
            initExitFeePPM,
            initFlashLoanFeePPM,
            initAverageRateMaxDeviationPPM
        );
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __NetworkSettings_init(
        ITokenHolder initNetworkFeeWallet,
        uint32 initNetworkFeePPM,
        uint32 initExitFeePPM,
        uint32 initFlashLoanFeePPM,
        uint32 initAverageRateMaxDeviationPPM
    ) internal initializer {
        __Owned_init();

        __NetworkSettings_init_unchained(
            initNetworkFeeWallet,
            initNetworkFeePPM,
            initExitFeePPM,
            initFlashLoanFeePPM,
            initAverageRateMaxDeviationPPM
        );
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __NetworkSettings_init_unchained(
        ITokenHolder initNetworkFeeWallet,
        uint32 initNetworkFeePPM,
        uint32 initExitFeePPM,
        uint32 initFlashLoanFeePPM,
        uint32 initAverageRateMaxDeviationPPM
    )
        internal
        initializer
        validAddress(address(initNetworkFeeWallet))
        validFee(initNetworkFeePPM)
        validFee(initExitFeePPM)
        validFee(initFlashLoanFeePPM)
        validPortion(initAverageRateMaxDeviationPPM)
    {
        _networkFeeWallet = initNetworkFeeWallet;
        _networkFeePPM = initNetworkFeePPM;
        _exitFeePPM = initExitFeePPM;
        _flashLoanFeePPM = initFlashLoanFeePPM;
        _averageRateMaxDeviationPPM = initAverageRateMaxDeviationPPM;
    }

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
    function protectedTokensWhitelist() external view override returns (IReserveToken[] memory) {
        uint256 length = _protectedTokensWhitelist.length();
        IReserveToken[] memory list = new IReserveToken[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = IReserveToken(_protectedTokensWhitelist.at(i));
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
    function addTokenToProtectedTokensWhitelist(IReserveToken token)
        external
        override
        onlyOwner
        validExternalAddress(address(token))
    {
        require(_protectedTokensWhitelist.add(address(token)), "ERR_ALREADY_WHITELISTED");

        emit TokenAddedToWhitelist(token);
    }

    /**
     * @dev removes a token from the protected tokens whitelist
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function removeTokenFromProtectedTokensWhitelist(IReserveToken token) external override onlyOwner {
        require(_protectedTokensWhitelist.remove(address(token)), "ERR_NOT_WHITELISTED");

        emit TokenRemovedFromWhitelist(token);
    }

    /**
     * @dev checks whether a given token is whitelisted
     */
    function isTokenWhitelisted(IReserveToken token) external view override returns (bool) {
        return _protectedTokensWhitelist.contains(address(token));
    }

    /**
     * @dev returns the network token minting limit for a given pool
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
    function setPoolMintingLimit(IReserveToken token, uint256 amount)
        external
        override
        onlyOwner
        validAddress(address(token))
    {
        emit MintingLimitUpdated(token, _poolMintingLimits[token], amount);

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
        override
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
    function setNetworkFeePPM(uint32 newNetworkFeePPM) external override onlyOwner validFee(newNetworkFeePPM) {
        emit NetworkFeePPMUpdated(_networkFeePPM, newNetworkFeePPM);

        _networkFeePPM = newNetworkFeePPM;
    }

    /**
     * @dev returns the exit fee (in units of PPM)
     */
    function exitFeePPM() external view override returns (uint32) {
        return _exitFeePPM;
    }

    /**
     * @dev sets the exit fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setExitFeePPM(uint32 newExitFeePPM) external override onlyOwner validFee(newExitFeePPM) {
        emit ExitFeePPMUpdated(_exitFeePPM, newExitFeePPM);

        _exitFeePPM = newExitFeePPM;
    }

    /**
     * @dev returns the flashLoan fee (in units of PPM)
     */
    function flashLoanFeePPM() external view override returns (uint32) {
        return _flashLoanFeePPM;
    }

    /**
     * @dev sets the flash fee (in units of PPM)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setFlashLoanFeePPM(uint32 newFlashLoanFeePPM) external override onlyOwner validFee(newFlashLoanFeePPM) {
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
        override
        onlyOwner
        validPortion(newAverageRateMaxDeviationPPM)
    {
        emit AverageRateMaxDeviationPPMUpdated(_averageRateMaxDeviationPPM, newAverageRateMaxDeviationPPM);

        _averageRateMaxDeviationPPM = newAverageRateMaxDeviationPPM;
    }
}

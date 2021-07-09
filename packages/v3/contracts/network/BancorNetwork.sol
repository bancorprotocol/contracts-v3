// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "../utility/OwnedUpgradeable.sol";
import "../utility/Upgradeable.sol";
import "../utility/Utils.sol";

import "../token/ReserveToken.sol";

import "../pools/interfaces/ILiquidityPoolCollection.sol";

import "./interfaces/IBancorNetwork.sol";
import "./interfaces/INetworkSettings.sol";
import "./interfaces/IPendingWithdrawals.sol";

/**
 * @dev Bancor Network contract
 */
contract BancorNetwork is IBancorNetwork, Upgradeable, OwnedUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the pending withdrawals management contract
    IPendingWithdrawals private immutable _pendingWithdrawals;

    // the address of protection wallet (used for joint IL protectino)
    ITokenHolder private _protectionWallet;

    // the set of all valid liquidity pool collections
    EnumerableSetUpgradeable.AddressSet private _poolCollections;

    // a mapping between the last collection that was added to the liquidity pool collections set and its type
    mapping(uint16 => ILiquidityPoolCollection) private _latestPoolCollections;

    // the set of all liquidity pools
    EnumerableSetUpgradeable.AddressSet private _liquidityPools;

    // a mapping between reserve tokens and their respective liquidity pool collections
    mapping(IReserveToken => ILiquidityPoolCollection) private _collectionByPool;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 7] private __gap;

    /**
     * @dev triggered when the protection wallet is updated
     */
    event ProtectionWalletUpdated(ITokenHolder prevWallet, ITokenHolder newWallet);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(INetworkSettings initSettings, IPendingWithdrawals initPendingWithdrawals)
        validAddress(address(initSettings))
        validAddress(address(initPendingWithdrawals))
    {
        _settings = initSettings;
        _pendingWithdrawals = initPendingWithdrawals;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __BancorNetwork_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorNetwork_init() internal initializer {
        __Owned_init();
        __ReentrancyGuard_init();

        __BancorNetwork_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorNetwork_init_unchained() internal initializer {}

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @dev returns the pending withdrawals management contract
     */
    function settings() external view returns (INetworkSettings) {
        return _settings;
    }

    /**
     * @dev returns the network settings
     */
    function pendingWithdrawals() external view returns (IPendingWithdrawals) {
        return _pendingWithdrawals;
    }

    /**
     * @dev returns the address of protection wallet (used for joint IL protectino)
     */
    function protectionWallet() external view returns (ITokenHolder) {
        return _protectionWallet;
    }

    /**
     * @dev sets the address of protection wallet (used for joint IL protectino)
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setProtectionWallet(ITokenHolder newProtectionWallet)
        external
        validAddress(address(newProtectionWallet))
        onlyOwner
    {
        emit ProtectionWalletUpdated(_protectionWallet, newProtectionWallet);

        _protectionWallet = newProtectionWallet;
    }

    /**
     * @dev returns the set of all valid liquidity pool collections
     */
    function poolCollections() external view returns (ILiquidityPoolCollection[] memory) {
        uint256 length = _poolCollections.length();
        ILiquidityPoolCollection[] memory list = new ILiquidityPoolCollection[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = ILiquidityPoolCollection(_poolCollections.at(i));
        }
        return list;
    }

    /**
     * @dev returns the last collection that was added to the liquidity pool collections set for a specific type
     */
    function latestPoolCollection(uint16 _type) external view returns (ILiquidityPoolCollection) {
        return _latestPoolCollections[_type];
    }

    /**
     * @dev returns the set of all liquidity pools
     */
    function liquidityPools() external view returns (ILiquidityPoolCollection[] memory) {
        uint256 length = _liquidityPools.length();
        ILiquidityPoolCollection[] memory list = new ILiquidityPoolCollection[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = ILiquidityPoolCollection(_liquidityPools.at(i));
        }
        return list;
    }

    /**
     * @dev returns the respective liquidity pool collection for the provided reserve token
     */
    function collectionByPool(IReserveToken _reserveToken) external view returns (ILiquidityPoolCollection) {
        return _collectionByPool[_reserveToken];
    }
}

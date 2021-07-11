// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "../utility/OwnedUpgradeable.sol";
import "../utility/Upgradeable.sol";
import "../utility/Utils.sol";

import "../token/ReserveToken.sol";

import "./interfaces/IBancorNetwork.sol";

/**
 * @dev Bancor Network contract
 */
contract BancorNetwork is IBancorNetwork, Upgradeable, OwnedUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the pending withdrawals contract
    IPendingWithdrawals private immutable _pendingWithdrawals;

    // the address of protection wallet (used for external protection)
    ITokenHolder private _protectionWallet;

    // the set of all valid liquidity pool collections
    EnumerableSetUpgradeable.AddressSet private _poolCollections;

    // a mapping between the last collection that was added to the liquidity pool collections set and its type
    mapping(uint16 => ILiquidityPoolCollection) private _latestPoolCollections;

    // the set of all liquidity pools
    EnumerableSetUpgradeable.AddressSet private _liquidityPools;

    // a mapping between pools and their respective liquidity pool collections
    mapping(IReserveToken => ILiquidityPoolCollection) private _collectionByPool;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 7] private __gap;

    /**
     * @dev triggered when the protection wallet is updated
     */
    event ProtectionWalletUpdated(ITokenHolder indexed prevWallet, ITokenHolder indexed newWallet);

    /**
     * @dev triggered when a new liquidity pool collection is added
     */
    event PoolCollectionAdded(ILiquidityPoolCollection indexed collection, uint16 indexed poolType);

    /**
     * @dev triggered when an existing liquidity pool collection is removed
     */
    event PoolCollectionRemoved(ILiquidityPoolCollection indexed collection, uint16 indexed poolType);

    /**
     * @dev triggered when a new pool is added
     */
    event PoolAdded(IReserveToken indexed pool, ILiquidityPoolCollection indexed collection, uint16 indexed poolType);

    /**
     * @dev triggered when an existing pool is upgraded
     */
    event PoolUpgraded(
        IReserveToken indexed pool,
        ILiquidityPoolCollection prevCollection,
        ILiquidityPoolCollection newCollection,
        uint16 prevVersion,
        uint16 newVersion
    );

    /**
     * @dev triggered when liquidity is added
     */
    event FundsDeposited(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        address indexed provider,
        ILiquidityPoolCollection collection,
        uint256 amount,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when liquidity is removed
     */
    event FundsWithdrawn(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        address indexed provider,
        ILiquidityPoolCollection collection,
        uint256 amount,
        uint256 poolTokenAmount,
        uint256 baseTokenAmount,
        uint256 networkTokenAmount
    );

    /**
     * @dev triggered when liquidity is migrated
     */
    event FundsMigrated(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        address indexed provider,
        uint256 amount,
        uint256 availableTokens
    );

    /**
     * @dev triggered when the total liqudity in a pool is updated
     */
    event TotalLiquidityUpdated(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        uint256 poolTokenSupply,
        uint256 stakedBalance,
        uint256 actualBalance
    );

    /**
     * @dev triggered when the trading liqudity in a pool is updated
     */
    event TradingLiquidityUpdated(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        IReserveToken indexed reserveToken,
        uint256 liquidity
    );

    /**
     * @dev triggered on a succesful trading
     */
    event TokensTraded(
        bytes32 contextId,
        IReserveToken indexed pool,
        IReserveToken indexed sourceToken,
        IReserveToken indexed targetToken,
        address trader,
        uint256 sourceAmount,
        uint256 targetAmount
    );

    /**
     * @dev triggered when a flash-loan is completed
     */
    event FlashLoaned(bytes32 indexed contextId, IReserveToken indexed pool, address indexed borrower, uint256 amount);

    /**
     * @dev triggered when trading/flash-loan fees are collected
     */
    event FeesCollected(bytes32 indexed contextId, IReserveToken indexed pool, uint256 amount, uint256 stakedBalance);

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
    function settings() external view override returns (INetworkSettings) {
        return _settings;
    }

    /**
     * @dev returns the network settings
     */
    function pendingWithdrawals() external view override returns (IPendingWithdrawals) {
        return _pendingWithdrawals;
    }

    /**
     * @dev returns the address of protection wallet
     */
    function protectionWallet() external view override returns (ITokenHolder) {
        return _protectionWallet;
    }

    /**
     * @dev sets the address of protection wallet
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
    function poolCollections() external view override returns (ILiquidityPoolCollection[] memory) {
        uint256 length = _poolCollections.length();
        ILiquidityPoolCollection[] memory list = new ILiquidityPoolCollection[](length);
        for (uint256 i = 0; i < length; ++i) {
            list[i] = ILiquidityPoolCollection(_poolCollections.at(i));
        }
        return list;
    }

    /**
     * @dev returns the last collection that was added to the liquidity pool collections set for a specific type
     */
    function latestPoolCollection(uint16 poolType) external view override returns (ILiquidityPoolCollection) {
        return _latestPoolCollections[poolType];
    }

    /**
     * @dev returns the set of all liquidity pools
     */
    function liquidityPools() external view override returns (ILiquidityPoolCollection[] memory) {
        uint256 length = _liquidityPools.length();
        ILiquidityPoolCollection[] memory list = new ILiquidityPoolCollection[](length);
        for (uint256 i = 0; i < length; ++i) {
            list[i] = ILiquidityPoolCollection(_liquidityPools.at(i));
        }
        return list;
    }

    /**
     * @dev returns the respective liquidity pool collection for the provided pool
     */
    function collectionByPool(IReserveToken pool) external view override returns (ILiquidityPoolCollection) {
        return _collectionByPool[pool];
    }
}

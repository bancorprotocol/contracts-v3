// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import { ITokenHolder } from "../utility/interfaces/ITokenHolder.sol";
import { OwnedUpgradeable } from "../utility/OwnedUpgradeable.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

import { ILiquidityPoolCollection } from "../pools/interfaces/ILiquidityPoolCollection.sol";

import { INetworkSettings } from "./interfaces/INetworkSettings.sol";
import { IPendingWithdrawals } from "./interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";

/**
 * @dev Bancor Network contract
 */
contract BancorNetwork is IBancorNetwork, Upgradeable, OwnedUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // the address of the network token
    IERC20 private immutable _networkToken;

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the pending withdrawals contract
    IPendingWithdrawals private _pendingWithdrawals;

    // the address of the external protection wallet
    ITokenHolder private _externalProtectionWallet;

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
     * @dev triggered when the external protection wallet is updated
     */
    event ExternalProtectionWalletUpdated(ITokenHolder indexed prevWallet, ITokenHolder indexed newWallet);

    /**
     * @dev triggered when a new liquidity pool collection is added
     */
    event PoolCollectionAdded(uint16 indexed poolType, ILiquidityPoolCollection indexed collection);

    /**
     * @dev triggered when an existing liquidity pool collection is removed
     */
    event PoolCollectionRemoved(uint16 indexed poolType, ILiquidityPoolCollection indexed collection);

    /**
     * @dev triggered when the latest pool collection, for a specific type, is replaced
     */
    event LatestPoolCollectionReplaced(
        uint16 indexed poolType,
        ILiquidityPoolCollection indexed prevCollection,
        ILiquidityPoolCollection indexed newCollection
    );

    /**
     * @dev triggered when a new pool is added
     */
    event PoolAdded(uint16 indexed poolType, IReserveToken indexed pool, ILiquidityPoolCollection indexed collection);

    /**
     * @dev triggered when an existing pool is upgraded
     */
    event PoolUpgraded(
        uint16 indexed poolType,
        IReserveToken indexed pool,
        ILiquidityPoolCollection prevCollection,
        ILiquidityPoolCollection newCollection,
        uint16 prevVersion,
        uint16 newVersion
    );

    /**
     * @dev triggered when funds are deposited
     */
    event FundsDeposited(
        bytes32 indexed contextId,
        IReserveToken indexed token,
        address indexed provider,
        ILiquidityPoolCollection collection,
        uint256 depositAmount,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when funds are withdrawn
     */
    event FundsWithdrawn(
        bytes32 indexed contextId,
        IReserveToken indexed token,
        address indexed provider,
        ILiquidityPoolCollection collection,
        uint256 withdrawAmount,
        uint256 poolTokenAmount,
        uint256 baseTokenAmount,
        uint256 externalProtectionBaseTokenAmount,
        uint256 networkTokenAmount,
        uint256 withdrawalFee
    );

    /**
     * @dev triggered when funds are migrated
     */
    event FundsMigrated(
        bytes32 indexed contextId,
        IReserveToken indexed token,
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
     * @dev triggered on a successful trade
     */
    event TokensTraded(
        bytes32 contextId,
        IReserveToken indexed pool,
        IReserveToken indexed sourceToken,
        IReserveToken indexed targetToken,
        uint256 sourceAmount,
        uint256 targetAmount,
        address trader
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
    constructor(IERC20 initNetworkToken, INetworkSettings initSettings)
        validAddress(address(initNetworkToken))
        validAddress(address(initSettings))
    {
        _networkToken = initNetworkToken;
        _settings = initSettings;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize(IPendingWithdrawals initPendingWithdrawals) external initializer {
        __BancorNetwork_init(initPendingWithdrawals);
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorNetwork_init(IPendingWithdrawals initPendingWithdrawals) internal initializer {
        __Owned_init();
        __ReentrancyGuard_init();

        __BancorNetwork_init_unchained(initPendingWithdrawals);
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorNetwork_init_unchained(IPendingWithdrawals initPendingWithdrawals) internal initializer {
        _pendingWithdrawals = initPendingWithdrawals;
    }

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function networkToken() external view override returns (IERC20) {
        return _networkToken;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function settings() external view override returns (INetworkSettings) {
        return _settings;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function pendingWithdrawals() external view override returns (IPendingWithdrawals) {
        return _pendingWithdrawals;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function externalProtectionWallet() external view override returns (ITokenHolder) {
        return _externalProtectionWallet;
    }

    /**
     * @dev sets the address of the external protection wallet
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setExternalProtectionWallet(ITokenHolder newExternalProtectionWallet)
        external
        validAddress(address(newExternalProtectionWallet))
        onlyOwner
    {
        emit ExternalProtectionWalletUpdated(_externalProtectionWallet, newExternalProtectionWallet);

        newExternalProtectionWallet.acceptOwnership();

        _externalProtectionWallet = newExternalProtectionWallet;
    }

    /**
     * @dev transfers the ownership of the external protection wallet
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     * - the new owner needs to accept the transfer
     */
    function transferExternalProtectionWalletOwnership(address newOwner) external onlyOwner {
        _externalProtectionWallet.transferOwnership(newOwner);
    }

    /**
     * @dev adds new pool collection to the network
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function addPoolCollection(ILiquidityPoolCollection poolCollection)
        external
        validAddress(address(poolCollection))
        nonReentrant
        onlyOwner
    {
        require(_poolCollections.add(address(poolCollection)), "ERR_COLLECTION_ALREADY_EXISTS");

        uint16 poolType = poolCollection.poolType();
        _setLatestPoolCollection(poolType, poolCollection);

        emit PoolCollectionAdded(poolType, poolCollection);
    }

    /**
     * @dev removes an existing pool collection from the pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function removePoolCollection(
        ILiquidityPoolCollection poolCollection,
        ILiquidityPoolCollection newLatestPoolCollection
    ) external onlyOwner nonReentrant {
        // verify that a pool collection is a valid latest pool collection (e.g., it either exists or a reset to zero)
        _verifyLatestPoolCollectionCandidate(newLatestPoolCollection);

        // verify that no pools are associated with the specified collection
        _verifyEmptyPoolCollection(poolCollection);

        require(_poolCollections.remove(address(poolCollection)), "ERR_COLLECTION_DOES_NOT_EXIST");

        uint16 poolType = poolCollection.poolType();
        if (address(newLatestPoolCollection) != address(0)) {
            uint16 newLatestPoolCollectionType = newLatestPoolCollection.poolType();
            require(poolType == newLatestPoolCollectionType, "ERR_WRONG_COLLECTION_TYPE");
        }

        _setLatestPoolCollection(poolType, newLatestPoolCollection);

        emit PoolCollectionRemoved(poolType, poolCollection);
    }

    /**
     * @dev sets the new latest pool collection for the given type
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setLatestPoolCollection(ILiquidityPoolCollection poolCollection)
        external
        nonReentrant
        validAddress(address(poolCollection))
        onlyOwner
    {
        _verifyLatestPoolCollectionCandidate(poolCollection);

        _setLatestPoolCollection(poolCollection.poolType(), poolCollection);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function poolCollections() external view override returns (ILiquidityPoolCollection[] memory) {
        uint256 length = _poolCollections.length();
        ILiquidityPoolCollection[] memory list = new ILiquidityPoolCollection[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = ILiquidityPoolCollection(_poolCollections.at(i));
        }
        return list;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function latestPoolCollection(uint16 poolType) external view override returns (ILiquidityPoolCollection) {
        return _latestPoolCollections[poolType];
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function liquidityPools() external view override returns (IReserveToken[] memory) {
        uint256 length = _liquidityPools.length();
        IReserveToken[] memory list = new IReserveToken[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = IReserveToken(_liquidityPools.at(i));
        }
        return list;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function collectionByPool(IReserveToken pool) external view override returns (ILiquidityPoolCollection) {
        return _collectionByPool[pool];
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function isPoolValid(IReserveToken pool) external view override returns (bool) {
        return address(pool) == address(_networkToken) || _liquidityPools.contains(address(pool));
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function createPool(uint16 poolType, IReserveToken reserveToken)
        external
        override
        nonReentrant
        validAddress(address(reserveToken))
    {
        require(_liquidityPools.add(address(reserveToken)), "ERR_POOL_ALREADY_EXISTS");

        // get the latest pool collection, corresponding to the requested type of the new pool, and use it to create the
        // pool
        ILiquidityPoolCollection poolCollection = _latestPoolCollections[poolType];
        require(address(poolCollection) != address(0), "ERR_UNSUPPORTED_TYPE");

        // this is where the magic happens...
        poolCollection.createPool(reserveToken);

        // add the pool to the reverse pool collection lookup
        _collectionByPool[reserveToken] = poolCollection;

        emit PoolAdded(poolType, reserveToken, poolCollection);
    }

    /**
     * @dev sets the new latest pool collection for the given type
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function _setLatestPoolCollection(uint16 poolType, ILiquidityPoolCollection poolCollection) private {
        emit LatestPoolCollectionReplaced(poolType, _latestPoolCollections[poolType], poolCollection);

        _latestPoolCollections[poolType] = poolCollection;
    }

    /**
     * @dev verifies that a pool collection is a valid latest pool collection (e.g., it either exists or a reset to zero)
     */
    function _verifyLatestPoolCollectionCandidate(ILiquidityPoolCollection poolCollection) private view {
        require(
            address(poolCollection) == address(0) || _poolCollections.contains(address(poolCollection)),
            "ERR_COLLECTION_DOES_NOT_EXIST"
        );
    }

    /**
     * @dev verifies that no pools are associated with the specified collection
     */
    function _verifyEmptyPoolCollection(ILiquidityPoolCollection poolCollection) private view {
        uint256 length = _liquidityPools.length();
        for (uint256 i = 0; i < length; i++) {
            require(
                _collectionByPool[IReserveToken(_liquidityPools.at(i))] != poolCollection,
                "ERR_COLLECTION_IS_NOT_EMPTY"
            );
        }
    }
}

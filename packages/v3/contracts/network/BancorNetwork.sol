// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { ITokenHolder } from "../utility/interfaces/ITokenHolder.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Time } from "../utility/Time.sol";
import { uncheckedInc } from "../utility/MathEx.sol";

// prettier-ignore
import {
    Utils,
    AlreadyExists,
    DoesNotExist,
    InvalidPool,
    InvalidToken,
    InvalidType,
    NotEmpty,
    NotWhitelisted
 } from "../utility/Utils.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

// prettier-ignore
import {
    IPoolCollection,
    PoolLiquidity,
    DepositAmounts as PoolCollectionDepositAmounts,
    WithdrawalAmounts as PoolCollectionWithdrawalAmounts,
    TradeAmountsWithLiquidity,
    TradeAmounts
} from "../pools/interfaces/IPoolCollection.sol";

import { IPoolCollectionUpgrader } from "../pools/interfaces/IPoolCollectionUpgrader.sol";

// prettier-ignore
import {
    INetworkTokenPool,
    DepositAmounts as NetworkTokenPoolDepositAmounts,
    WithdrawalAmounts as NetworkTokenPoolWithdrawalAmounts
} from "../pools/interfaces/INetworkTokenPool.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";

import { INetworkSettings } from "./interfaces/INetworkSettings.sol";
import { IPendingWithdrawals, WithdrawalRequest, CompletedWithdrawal } from "./interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { IBancorVault } from "./interfaces/IBancorVault.sol";

import { TRADING_FEE } from "./FeeTypes.sol";

error DeadlineExpired();
error EthAmountMismatch();
error InvalidTokens();
error NetworkLiquidityDisabled();
error PermitUnsupported();

/**
 * @dev Bancor Network contract
 */
contract BancorNetwork is IBancorNetwork, Upgradeable, ReentrancyGuardUpgradeable, Time, Utils {
    using Address for address payable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using ReserveTokenLibrary for ReserveToken;

    // the migration manager role is required for migrating liquidity
    bytes32 public constant ROLE_MIGRATION_MANAGER = keccak256("ROLE_MIGRATION_MANAGER");

    // the address of the network token
    IERC20 private immutable _networkToken;

    // the address of the network token governance
    ITokenGovernance private immutable _networkTokenGovernance;

    // the address of the governance token
    IERC20 private immutable _govToken;

    // the address of the governance token governance
    ITokenGovernance private immutable _govTokenGovernance;

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the vault contract
    IBancorVault private immutable _vault;

    // the network token pool token
    IPoolToken internal immutable _networkPoolToken;

    // the network token pool contract
    INetworkTokenPool internal _networkTokenPool;

    // the pending withdrawals contract
    IPendingWithdrawals internal _pendingWithdrawals;

    // the pool collection upgrader contract
    IPoolCollectionUpgrader internal _poolCollectionUpgrader;

    // the address of the external protection wallet
    ITokenHolder private _externalProtectionWallet;

    // the set of all valid pool collections
    EnumerableSetUpgradeable.AddressSet private _poolCollections;

    // a mapping between the last pool collection that was added to the pool collections set and its type
    mapping(uint16 => IPoolCollection) private _latestPoolCollections;

    // the set of all pools
    EnumerableSetUpgradeable.AddressSet private _liquidityPools;

    // a mapping between pools and their respective pool collections
    mapping(ReserveToken => IPoolCollection) private _collectionByPool;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 7] private __gap;

    /**
     * @dev triggered when the external protection wallet is updated
     */
    event ExternalProtectionWalletUpdated(ITokenHolder indexed prevWallet, ITokenHolder indexed newWallet);

    /**
     * @dev triggered when a new pool collection is added
     */
    event PoolCollectionAdded(uint16 indexed poolType, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when an existing pool collection is removed
     */
    event PoolCollectionRemoved(uint16 indexed poolType, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when the latest pool collection, for a specific type, is replaced
     */
    event LatestPoolCollectionReplaced(
        uint16 indexed poolType,
        IPoolCollection indexed prevPoolCollection,
        IPoolCollection indexed newPoolCollection
    );

    /**
     * @dev triggered when a new pool is added
     */
    event PoolAdded(uint16 indexed poolType, ReserveToken indexed pool, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when base token liquidity is deposited
     */
    event BaseTokenDeposited(
        bytes32 indexed contextId,
        ReserveToken indexed token,
        address indexed provider,
        IPoolCollection poolCollection,
        uint256 depositAmount,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when network token liquidity is deposited
     */
    event NetworkTokenDeposited(
        bytes32 indexed contextId,
        address indexed provider,
        uint256 depositAmount,
        uint256 poolTokenAmount,
        uint256 govTokenAmount
    );

    /**
     * @dev triggered when base token liquidity is withdrawn
     */
    event BaseTokenWithdrawn(
        bytes32 indexed contextId,
        ReserveToken indexed token,
        address indexed provider,
        IPoolCollection poolCollection,
        uint256 baseTokenAmount,
        uint256 poolTokenAmount,
        uint256 externalProtectionBaseTokenAmount,
        uint256 networkTokenAmount,
        uint256 withdrawalFeeAmount
    );

    /**
     * @dev triggered when network token liquidity is withdrawn
     */
    event NetworkTokenWithdrawn(
        bytes32 indexed contextId,
        address indexed provider,
        uint256 networkTokenAmount,
        uint256 poolTokenAmount,
        uint256 govTokenAmount,
        uint256 withdrawalFeeAmount
    );

    /**
     * @dev triggered when funds are migrated
     */
    event FundsMigrated(
        bytes32 indexed contextId,
        ReserveToken indexed token,
        address indexed provider,
        uint256 amount,
        uint256 availableTokens
    );

    /**
     * @dev triggered when the total liqudity in a pool is updated
     */
    event TotalLiquidityUpdated(
        bytes32 indexed contextId,
        ReserveToken indexed pool,
        uint256 poolTokenSupply,
        uint256 stakedBalance,
        uint256 actualBalance
    );

    /**
     * @dev triggered when the trading liqudity in a pool is updated
     */
    event TradingLiquidityUpdated(
        bytes32 indexed contextId,
        ReserveToken indexed pool,
        ReserveToken indexed reserveToken,
        uint256 liquidity
    );

    /**
     * @dev triggered on a successful trade
     */
    event TokensTraded(
        bytes32 contextId,
        ReserveToken indexed pool,
        ReserveToken indexed sourceToken,
        ReserveToken indexed targetToken,
        uint256 sourceAmount,
        uint256 targetAmount,
        address trader
    );

    /**
     * @dev triggered when a flash-loan is completed
     */
    event FlashLoanCompleted(
        bytes32 indexed contextId,
        ReserveToken indexed token,
        address indexed borrower,
        uint256 amount
    );

    /**
     * @dev triggered when trading/flash-loan fees are collected
     */
    event FeesCollected(
        bytes32 indexed contextId,
        ReserveToken indexed token,
        uint8 indexed feeType,
        uint256 amount,
        uint256 stakedBalance
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initSettings,
        IBancorVault initVault,
        IPoolToken initNetworkPoolToken
    )
        validAddress(address(initNetworkTokenGovernance))
        validAddress(address(initGovTokenGovernance))
        validAddress(address(initSettings))
        validAddress(address(initVault))
        validAddress(address(initNetworkPoolToken))
    {
        _networkTokenGovernance = initNetworkTokenGovernance;
        _networkToken = initNetworkTokenGovernance.token();
        _govTokenGovernance = initGovTokenGovernance;
        _govToken = initGovTokenGovernance.token();

        _settings = initSettings;
        _vault = initVault;
        _networkPoolToken = initNetworkPoolToken;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize(
        INetworkTokenPool initNetworkTokenPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    )
        external
        validAddress(address(initNetworkTokenPool))
        validAddress(address(initPendingWithdrawals))
        validAddress(address(initPoolCollectionUpgrader))
        initializer
    {
        __BancorNetwork_init(initNetworkTokenPool, initPendingWithdrawals, initPoolCollectionUpgrader);
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorNetwork_init(
        INetworkTokenPool initNetworkTokenPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    ) internal initializer {
        __Upgradeable_init();
        __ReentrancyGuard_init();

        __BancorNetwork_init_unchained(initNetworkTokenPool, initPendingWithdrawals, initPoolCollectionUpgrader);
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorNetwork_init_unchained(
        INetworkTokenPool initNetworkTokenPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    ) internal initializer {
        _networkTokenPool = initNetworkTokenPool;
        _pendingWithdrawals = initPendingWithdrawals;
        _poolCollectionUpgrader = initPoolCollectionUpgrader;

        // set up administrative roles
        _setRoleAdmin(ROLE_MIGRATION_MANAGER, ROLE_ADMIN);
    }

    // solhint-enable func-name-mixedcase

    modifier validTokensForTrade(ReserveToken sourceToken, ReserveToken targetToken) {
        _validTokensForTrade(sourceToken, targetToken);

        _;
    }

    function _validTokensForTrade(ReserveToken sourceToken, ReserveToken targetToken) internal pure {
        _validAddress(ReserveToken.unwrap(sourceToken));
        _validAddress(ReserveToken.unwrap(targetToken));

        if (ReserveToken.unwrap(sourceToken) == ReserveToken.unwrap(targetToken)) {
            revert InvalidTokens();
        }
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function networkToken() external view returns (IERC20) {
        return _networkToken;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function networkTokenGovernance() external view returns (ITokenGovernance) {
        return _networkTokenGovernance;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function govToken() external view returns (IERC20) {
        return _govToken;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function govTokenGovernance() external view returns (ITokenGovernance) {
        return _govTokenGovernance;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function settings() external view returns (INetworkSettings) {
        return _settings;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function vault() external view returns (IBancorVault) {
        return _vault;
    }

    /**
     * @dev IBancorNetwork
     */
    function networkPoolToken() external view returns (IPoolToken) {
        return _networkPoolToken;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function networkTokenPool() external view returns (INetworkTokenPool) {
        return _networkTokenPool;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function pendingWithdrawals() external view returns (IPendingWithdrawals) {
        return _pendingWithdrawals;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function poolCollectionUpgrader() external view returns (IPoolCollectionUpgrader) {
        return _poolCollectionUpgrader;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function externalProtectionWallet() external view returns (ITokenHolder) {
        return _externalProtectionWallet;
    }

    /**
     * @dev sets the address of the external protection wallet
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setExternalProtectionWallet(ITokenHolder newExternalProtectionWallet)
        external
        validAddress(address(newExternalProtectionWallet))
        onlyAdmin
    {
        ITokenHolder prevExternalProtectionWallet = _externalProtectionWallet;
        if (prevExternalProtectionWallet == newExternalProtectionWallet) {
            return;
        }

        newExternalProtectionWallet.acceptOwnership();

        _externalProtectionWallet = newExternalProtectionWallet;

        emit ExternalProtectionWalletUpdated({
            prevWallet: prevExternalProtectionWallet,
            newWallet: newExternalProtectionWallet
        });
    }

    /**
     * @dev transfers the ownership of the external protection wallet
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the new owner needs to accept the transfer
     */
    function transferExternalProtectionWalletOwnership(address newOwner) external onlyAdmin {
        _externalProtectionWallet.transferOwnership(newOwner);
    }

    /**
     * @dev adds new pool collection to the network
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function addPoolCollection(IPoolCollection poolCollection)
        external
        validAddress(address(poolCollection))
        nonReentrant
        onlyAdmin
    {
        if (!_poolCollections.add(address(poolCollection))) {
            revert AlreadyExists();
        }

        // ensure that we're not adding a pool collection with the same type and version
        uint16 poolType = poolCollection.poolType();
        IPoolCollection prevLatestPoolCollection = _latestPoolCollections[poolType];
        if (
            address(prevLatestPoolCollection) != address(0) &&
            prevLatestPoolCollection.version() == poolCollection.version()
        ) {
            revert AlreadyExists();
        }

        _setLatestPoolCollection(poolType, poolCollection);

        emit PoolCollectionAdded({ poolType: poolType, poolCollection: poolCollection });
    }

    /**
     * @dev removes an existing pool collection from the pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function removePoolCollection(IPoolCollection poolCollection, IPoolCollection newLatestPoolCollection)
        external
        validAddress(address(poolCollection))
        onlyAdmin
        nonReentrant
    {
        // verify that a pool collection is a valid latest pool collection (e.g., it either exists or a reset to zero)
        _verifyLatestPoolCollectionCandidate(newLatestPoolCollection);

        // verify that no pools are associated with the specified pool collection
        if (poolCollection.poolCount() != 0) {
            revert NotEmpty();
        }

        if (!_poolCollections.remove(address(poolCollection))) {
            revert DoesNotExist();
        }

        uint16 poolType = poolCollection.poolType();
        if (address(newLatestPoolCollection) != address(0)) {
            uint16 newLatestPoolCollectionType = newLatestPoolCollection.poolType();
            if (poolType != newLatestPoolCollectionType) {
                revert InvalidType();
            }
        }

        _setLatestPoolCollection(poolType, newLatestPoolCollection);

        emit PoolCollectionRemoved({ poolType: poolType, poolCollection: poolCollection });
    }

    /**
     * @dev sets the new latest pool collection for the given type
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setLatestPoolCollection(IPoolCollection poolCollection)
        external
        nonReentrant
        validAddress(address(poolCollection))
        onlyAdmin
    {
        _verifyLatestPoolCollectionCandidate(poolCollection);

        _setLatestPoolCollection(poolCollection.poolType(), poolCollection);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function poolCollections() external view returns (IPoolCollection[] memory) {
        uint256 length = _poolCollections.length();
        IPoolCollection[] memory list = new IPoolCollection[](length);
        for (uint256 i = 0; i < length; i = uncheckedInc(i)) {
            list[i] = IPoolCollection(_poolCollections.at(i));
        }
        return list;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function latestPoolCollection(uint16 poolType) external view returns (IPoolCollection) {
        return _latestPoolCollections[poolType];
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function liquidityPools() external view returns (ReserveToken[] memory) {
        uint256 length = _liquidityPools.length();
        ReserveToken[] memory list = new ReserveToken[](length);
        for (uint256 i = 0; i < length; i = uncheckedInc(i)) {
            list[i] = ReserveToken.wrap(_liquidityPools.at(i));
        }
        return list;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function collectionByPool(ReserveToken pool) external view returns (IPoolCollection) {
        return _collectionByPool[pool];
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function isPoolValid(ReserveToken pool) external view returns (bool) {
        return
            ReserveToken.unwrap(pool) == address(_networkToken) || _liquidityPools.contains(ReserveToken.unwrap(pool));
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function createPool(uint16 poolType, ReserveToken reserveToken)
        external
        nonReentrant
        validAddress(ReserveToken.unwrap(reserveToken))
    {
        if (reserveToken.toIERC20() == _networkToken) {
            revert InvalidToken();
        }

        if (!_liquidityPools.add(ReserveToken.unwrap(reserveToken))) {
            revert AlreadyExists();
        }

        // get the latest pool collection, corresponding to the requested type of the new pool, and use it to create the
        // pool
        IPoolCollection poolCollection = _latestPoolCollections[poolType];
        if (address(poolCollection) == address(0)) {
            revert InvalidType();
        }

        // this is where the magic happens...
        poolCollection.createPool(reserveToken);

        // add the pool collection to the reverse pool collection lookup
        _collectionByPool[reserveToken] = poolCollection;

        emit PoolAdded({ poolType: poolType, pool: reserveToken, poolCollection: poolCollection });
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function upgradePools(ReserveToken[] calldata pools) external nonReentrant {
        uint256 length = pools.length;
        for (uint256 i = 0; i < length; i = uncheckedInc(i)) {
            ReserveToken pool = pools[i];

            // request the pool collection upgrader to upgrade the pool and get the new pool collection it exists in
            IPoolCollection newPoolCollection = _poolCollectionUpgrader.upgradePool(pool);
            if (newPoolCollection == IPoolCollection(address(0))) {
                continue;
            }

            // update the mapping between pools and their respective pool collections
            _collectionByPool[pool] = newPoolCollection;
        }
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function depositFor(
        address provider,
        ReserveToken pool,
        uint256 tokenAmount
    )
        external
        payable
        validAddress(provider)
        validAddress(ReserveToken.unwrap(pool))
        greaterThanZero(tokenAmount)
        nonReentrant
    {
        _depositFor(provider, pool, tokenAmount, msg.sender);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function deposit(ReserveToken pool, uint256 tokenAmount)
        external
        payable
        validAddress(ReserveToken.unwrap(pool))
        greaterThanZero(tokenAmount)
        nonReentrant
    {
        _depositFor(msg.sender, pool, tokenAmount, msg.sender);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function depositForPermitted(
        address provider,
        ReserveToken pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external
        validAddress(provider)
        validAddress(ReserveToken.unwrap(pool))
        greaterThanZero(tokenAmount)
        nonReentrant
    {
        _depositBaseTokenForPermitted(provider, pool, tokenAmount, deadline, v, r, s);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function depositPermitted(
        ReserveToken pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external validAddress(ReserveToken.unwrap(pool)) greaterThanZero(tokenAmount) nonReentrant {
        _depositBaseTokenForPermitted(msg.sender, pool, tokenAmount, deadline, v, r, s);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function withdraw(uint256 id) external nonReentrant {
        address provider = msg.sender;
        bytes32 contextId = _withdrawContextId(id, provider);

        // complete the withdrawal and claim the locked pool tokens
        CompletedWithdrawal memory completedRequest = _pendingWithdrawals.completeWithdrawal(contextId, provider, id);

        if (completedRequest.poolToken == _networkPoolToken) {
            _withdrawNetworkToken(contextId, provider, completedRequest);
        } else {
            _withdrawBaseToken(contextId, provider, completedRequest);
        }
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function trade(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary
    )
        external
        payable
        nonReentrant
        validTokensForTrade(sourceToken, targetToken)
        greaterThanZero(sourceAmount)
        greaterThanZero(minReturnAmount)
    {
        _trade(sourceToken, targetToken, sourceAmount, minReturnAmount, deadline, beneficiary, msg.sender);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function tradePermitted(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external
        nonReentrant
        validTokensForTrade(sourceToken, targetToken)
        greaterThanZero(sourceAmount)
        greaterThanZero(minReturnAmount)
    {
        address trader = msg.sender;

        _permit(sourceToken, sourceAmount, deadline, v, r, s, trader);

        _trade(sourceToken, targetToken, sourceAmount, minReturnAmount, deadline, beneficiary, trader);
    }

    /**
     * @dev returns the target amount by specifying the source amount
     */
    function tradeTargetAmount(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount
    ) external view validTokensForTrade(sourceToken, targetToken) greaterThanZero(sourceAmount) returns (uint256) {
        return _tradeAmount(sourceToken, targetToken, sourceAmount, true);
    }

    /**
     * @dev returns the source amount by specifying the target amount
     */
    function tradeSourceAmount(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 targetAmount
    ) external view validTokensForTrade(sourceToken, targetToken) greaterThanZero(targetAmount) returns (uint256) {
        return _tradeAmount(sourceToken, targetToken, targetAmount, false);
    }

    /**
     * @dev sets the new latest pool collection for the given type
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function _setLatestPoolCollection(uint16 poolType, IPoolCollection poolCollection) private {
        IPoolCollection prevLatestPoolCollection = _latestPoolCollections[poolType];
        if (prevLatestPoolCollection == poolCollection) {
            return;
        }

        _latestPoolCollections[poolType] = poolCollection;

        emit LatestPoolCollectionReplaced({
            poolType: poolType,
            prevPoolCollection: prevLatestPoolCollection,
            newPoolCollection: poolCollection
        });
    }

    /**
     * @dev verifies that a pool collection is a valid latest pool collection (e.g., it either exists or a reset to zero)
     */
    function _verifyLatestPoolCollectionCandidate(IPoolCollection poolCollection) private view {
        if (address(poolCollection) != address(0) && !_poolCollections.contains(address(poolCollection))) {
            revert DoesNotExist();
        }
    }

    /**
     * @dev generates context ID for a deposit requesst
     */
    function _depositContextId(
        address provider,
        ReserveToken pool,
        uint256 tokenAmount,
        address sender
    ) private view returns (bytes32) {
        return keccak256(abi.encodePacked(sender, _time(), provider, pool, tokenAmount));
    }

    /**
     * @dev generates context ID for a withdraw request
     */
    function _withdrawContextId(uint256 id, address sender) private view returns (bytes32) {
        return keccak256(abi.encodePacked(sender, _time(), id));
    }

    /**
     * @dev deposits liquidity for the specified provider from sender
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the liquidity tokens on its behalf
     */
    function _depositFor(
        address provider,
        ReserveToken pool,
        uint256 tokenAmount,
        address sender
    ) private {
        bytes32 contextId = _depositContextId(provider, pool, tokenAmount, sender);

        if (pool.toIERC20() == _networkToken) {
            _depositNetworkTokenFor(contextId, provider, tokenAmount, sender, false);
        } else {
            _depositBaseTokenFor(contextId, provider, pool, tokenAmount, sender);
        }
    }

    /**
     * @dev deposits network token liquidity for the specified provider from sender
     *
     * requirements:
     *
     * - the caller must have approved have approved the network to transfer network tokens to on its behalf
     */
    function _depositNetworkTokenFor(
        bytes32 contextId,
        address provider,
        uint256 networkTokenAmount,
        address sender,
        bool isMigrating
    ) private {
        INetworkTokenPool cachedNetworkTokenPool = _networkTokenPool;

        // transfer the tokens from the sender to the network token pool
        _networkToken.transferFrom(sender, address(cachedNetworkTokenPool), networkTokenAmount);

        // process network token pool deposit
        NetworkTokenPoolDepositAmounts memory depositAmounts = cachedNetworkTokenPool.depositFor(
            provider,
            networkTokenAmount,
            isMigrating,
            0
        );

        emit NetworkTokenDeposited({
            contextId: contextId,
            provider: provider,
            depositAmount: networkTokenAmount,
            poolTokenAmount: depositAmounts.poolTokenAmount,
            govTokenAmount: depositAmounts.govTokenAmount
        });

        emit TotalLiquidityUpdated({
            contextId: contextId,
            pool: ReserveToken.wrap(address(_networkToken)),
            poolTokenSupply: _networkPoolToken.totalSupply(),
            stakedBalance: cachedNetworkTokenPool.stakedBalance(),
            actualBalance: _networkToken.balanceOf(address(_vault))
        });
    }

    /**
     * @dev deposits base token liquidity for the specified provider from sender
     *
     * requirements:
     *
     * - the caller must have approved have approved the network to transfer base tokens to on its behalf
     */
    function _depositBaseTokenFor(
        bytes32 contextId,
        address provider,
        ReserveToken pool,
        uint256 baseTokenAmount,
        address sender
    ) private {
        INetworkTokenPool cachedNetworkTokenPool = _networkTokenPool;

        // get the pool collection that managed this pool
        IPoolCollection poolCollection = _poolCollection(pool);

        // if all network token liquidity is allocated - it's enough to check that the pool is whitelisted. Otherwise,
        // we need to check if the network token pool is able to provide network liquidity
        uint256 unallocatedNetworkTokenLiquidity = cachedNetworkTokenPool.unallocatedLiquidity(pool);
        if (unallocatedNetworkTokenLiquidity == 0 && !_settings.isTokenWhitelisted(pool)) {
            revert NotWhitelisted();
        } else if (!cachedNetworkTokenPool.isNetworkLiquidityEnabled(pool, poolCollection)) {
            revert NetworkLiquidityDisabled();
        }

        // transfer the tokens from the sender to the vault
        _depositToVault(pool, sender, baseTokenAmount);

        // process deposit to the base token pool (taking into account the ETH pool)
        PoolCollectionDepositAmounts memory depositAmounts = poolCollection.depositFor(
            provider,
            pool,
            baseTokenAmount,
            unallocatedNetworkTokenLiquidity
        );

        // request additional liquidity from the network token pool and transfer it to the vault
        if (depositAmounts.networkTokenDeltaAmount > 0) {
            cachedNetworkTokenPool.requestLiquidity(contextId, pool, depositAmounts.networkTokenDeltaAmount);
        }

        // TODO: process network fees based on the return values

        emit BaseTokenDeposited({
            contextId: contextId,
            token: pool,
            provider: provider,
            poolCollection: poolCollection,
            depositAmount: baseTokenAmount,
            poolTokenAmount: depositAmounts.poolTokenAmount
        });

        // TODO: reduce this external call by receiving these updated amounts as well
        PoolLiquidity memory poolLiquidity = poolCollection.poolLiquidity(pool);

        emit TotalLiquidityUpdated({
            contextId: contextId,
            pool: pool,
            poolTokenSupply: depositAmounts.poolToken.totalSupply(),
            stakedBalance: poolLiquidity.stakedBalance,
            actualBalance: pool.balanceOf(address(_vault))
        });

        emit TotalLiquidityUpdated({
            contextId: contextId,
            pool: ReserveToken.wrap(address(_networkToken)),
            poolTokenSupply: _networkPoolToken.totalSupply(),
            stakedBalance: cachedNetworkTokenPool.stakedBalance(),
            actualBalance: _networkToken.balanceOf(address(_vault))
        });

        emit TradingLiquidityUpdated({
            contextId: contextId,
            pool: pool,
            reserveToken: pool,
            liquidity: poolLiquidity.baseTokenTradingLiquidity
        });

        emit TradingLiquidityUpdated({
            contextId: contextId,
            pool: pool,
            reserveToken: ReserveToken.wrap(address(_networkToken)),
            liquidity: poolLiquidity.networkTokenTradingLiquidity
        });
    }

    /**
     * @dev performs an EIP2612 permit
     */
    function _permit(
        ReserveToken token,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address sender
    ) private {
        // neither the network token nor ETH support EIP2612 permit requests
        if (token.toIERC20() == _networkToken || token.isNativeToken()) {
            revert PermitUnsupported();
        }

        // permit the amount the caller is trying to deposit. Please note, that if the base token doesn't support
        // EIP2612 permit - either this call or the inner safeTransferFrom will revert
        IERC20Permit(ReserveToken.unwrap(token)).permit(sender, address(this), tokenAmount, deadline, v, r, s);
    }

    /**
     * @dev deposits liquidity for the specified provider by providing an EIP712 typed signature for an EIP2612 permit
     * request
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    function _depositBaseTokenForPermitted(
        address provider,
        ReserveToken pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        address sender = msg.sender;

        _permit(pool, tokenAmount, deadline, v, r, s, sender);

        _depositBaseTokenFor(
            _depositContextId(provider, pool, tokenAmount, sender),
            provider,
            pool,
            tokenAmount,
            sender
        );
    }

    /**
     * @dev handles network token withdrawal
     */
    function _withdrawNetworkToken(
        bytes32 contextId,
        address provider,
        CompletedWithdrawal memory completedRequest
    ) private {
        INetworkTokenPool cachedNetworkTokenPool = _networkTokenPool;

        // approve the network token pool to transfer pool tokens, which we have received from the completion of the
        // pending withdrawal, on behalf of the network
        completedRequest.poolToken.approve(address(cachedNetworkTokenPool), completedRequest.poolTokenAmount);

        // transfer governance tokens from the caller to the network token pool
        _govToken.transferFrom(provider, address(cachedNetworkTokenPool), completedRequest.poolTokenAmount);

        // call withdraw on the network token pool - returns the amounts/breakdown
        NetworkTokenPoolWithdrawalAmounts memory amounts = cachedNetworkTokenPool.withdraw(
            provider,
            completedRequest.poolTokenAmount
        );

        assert(amounts.poolTokenAmount == completedRequest.poolTokenAmount);

        emit NetworkTokenWithdrawn({
            contextId: contextId,
            provider: provider,
            networkTokenAmount: amounts.networkTokenAmount,
            poolTokenAmount: amounts.poolTokenAmount,
            govTokenAmount: amounts.govTokenAmount,
            withdrawalFeeAmount: amounts.withdrawalFeeAmount
        });

        emit TotalLiquidityUpdated({
            contextId: contextId,
            pool: ReserveToken.wrap(address(_networkToken)),
            poolTokenSupply: completedRequest.poolToken.totalSupply(),
            stakedBalance: cachedNetworkTokenPool.stakedBalance(),
            actualBalance: _networkToken.balanceOf(address(_vault))
        });
    }

    /**
     * @dev handles base token withdrawal
     */
    function _withdrawBaseToken(
        bytes32 contextId,
        address provider,
        CompletedWithdrawal memory completedRequest
    ) private {
        INetworkTokenPool cachedNetworkTokenPool = _networkTokenPool;

        ReserveToken pool = completedRequest.poolToken.reserveToken();

        // get the pool collection that manages this pool
        IPoolCollection poolCollection = _poolCollection(pool);

        // ensure that network token liquidity is enabled
        if (!cachedNetworkTokenPool.isNetworkLiquidityEnabled(pool, poolCollection)) {
            revert NetworkLiquidityDisabled();
        }

        // approve the pool collection to transfer pool tokens, which we have received from the completion of the
        // pending withdrawal, on behalf of the network
        completedRequest.poolToken.approve(address(poolCollection), completedRequest.poolTokenAmount);

        // call withdraw on the base token pool - returns the amounts/breakdown
        ITokenHolder cachedExternalProtectionWallet = _externalProtectionWallet;
        PoolCollectionWithdrawalAmounts memory amounts = poolCollection.withdraw(
            pool,
            completedRequest.poolTokenAmount,
            pool.balanceOf(address(_vault)),
            pool.balanceOf(address(cachedExternalProtectionWallet))
        );

        // if network token trading liquidity should be lowered - renounce liquidity
        if (amounts.networkTokenAmountToDeductFromLiquidity > 0) {
            cachedNetworkTokenPool.renounceLiquidity(contextId, pool, amounts.networkTokenAmountToDeductFromLiquidity);
        }

        // if the network token arbitrage is positive - ask the network token pool to mint network tokens into the vault
        if (amounts.networkTokenArbitrageAmount > 0) {
            cachedNetworkTokenPool.mint(address(_vault), uint256(amounts.networkTokenArbitrageAmount));
        }
        // if the network token arbitrage is negative - ask the network token pool to burn network tokens from the vault
        else if (amounts.networkTokenArbitrageAmount < 0) {
            cachedNetworkTokenPool.burnFromVault(uint256(-amounts.networkTokenArbitrageAmount));
        }

        // if the provider should receive some network tokens - ask the network token pool to mint network tokens to the
        // provider
        if (amounts.networkTokenAmountToMintForProvider > 0) {
            cachedNetworkTokenPool.mint(address(provider), amounts.networkTokenAmountToMintForProvider);
        }

        // if the provider should receive some base tokens from the vault - remove the tokens from the vault and send
        // them to the provider
        if (amounts.baseTokenAmountToTransferFromVaultToProvider > 0) {
            // base token amount to transfer from the vault to the provider
            _vault.withdrawTokens(pool, payable(provider), amounts.baseTokenAmountToTransferFromVaultToProvider);
        }

        // if the provider should receive some base tokens from the external wallet - remove the tokens from the
        // external wallet and send them to the provider
        if (amounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider > 0) {
            cachedExternalProtectionWallet.withdrawTokens(
                pool,
                payable(provider),
                amounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider
            );
        }

        emit BaseTokenWithdrawn({
            contextId: contextId,
            token: pool,
            provider: provider,
            poolCollection: poolCollection,
            baseTokenAmount: amounts.baseTokenAmountToTransferFromVaultToProvider +
                amounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
            poolTokenAmount: completedRequest.poolTokenAmount,
            externalProtectionBaseTokenAmount: amounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
            networkTokenAmount: amounts.networkTokenAmountToMintForProvider,
            withdrawalFeeAmount: amounts.baseTokenWithdrawalFeeAmount
        });

        // TODO: reduce this external call by receiving these updated amounts as well
        PoolLiquidity memory poolLiquidity = poolCollection.poolLiquidity(pool);

        emit TotalLiquidityUpdated({
            contextId: contextId,
            pool: pool,
            poolTokenSupply: completedRequest.poolToken.totalSupply(),
            stakedBalance: poolLiquidity.stakedBalance,
            actualBalance: pool.balanceOf(address(_vault))
        });

        emit TradingLiquidityUpdated({
            contextId: contextId,
            pool: pool,
            reserveToken: pool,
            liquidity: poolLiquidity.baseTokenTradingLiquidity
        });

        emit TradingLiquidityUpdated({
            contextId: contextId,
            pool: pool,
            reserveToken: ReserveToken.wrap(address(_networkToken)),
            liquidity: poolLiquidity.networkTokenTradingLiquidity
        });
    }

    /**
     * @dev performs a trade and returns the target amount and fee
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the source tokens on its behalf, in the non-ETH case
     */
    function _trade(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary,
        address trader
    ) private {
        if (deadline < _time()) {
            revert DeadlineExpired();
        }

        // ensure the beneficiary is set
        if (beneficiary == address(0)) {
            beneficiary = trader;
        }

        bytes32 contextId = keccak256(
            abi.encodePacked(
                trader,
                _time(),
                sourceToken,
                targetToken,
                sourceAmount,
                minReturnAmount,
                deadline,
                beneficiary
            )
        );

        // perform either a single or double hop trade, based on the source and the target pool
        uint256 tradeAmount;
        if (sourceToken.toIERC20() == _networkToken) {
            tradeAmount = _tradeNetworkToken(contextId, targetToken, true, sourceAmount, minReturnAmount, trader);
        } else if (targetToken.toIERC20() == _networkToken) {
            tradeAmount = _tradeNetworkToken(contextId, sourceToken, false, sourceAmount, minReturnAmount, trader);
        } else {
            tradeAmount = _tradeBaseTokens(contextId, sourceToken, targetToken, sourceAmount, minReturnAmount, trader);
        }

        // transfer the tokens from the trader to the vault
        _depositToVault(sourceToken, trader, sourceAmount);

        // transfer the target tokens/ETH to the beneficiary
        _vault.withdrawTokens(targetToken, payable(beneficiary), tradeAmount);
    }

    /**
     * @dev performs a single hop trade between the network token and a base token
     */
    function _tradeNetworkToken(
        bytes32 contextId,
        ReserveToken pool,
        bool isSourceNetworkToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        address trader
    ) private returns (uint256) {
        ReserveToken networkPool = ReserveToken.wrap(address(_networkToken));
        (ReserveToken sourceToken, ReserveToken targetToken) = isSourceNetworkToken
            ? (networkPool, pool)
            : (pool, networkPool);
        TradeAmountsWithLiquidity memory tradeAmounts = _poolCollection(pool).trade(
            sourceToken,
            targetToken,
            sourceAmount,
            minReturnAmount
        );

        INetworkTokenPool cachedNetworkTokenPool = _networkTokenPool;

        // if the target token is the network token, notify the network token pool on collected fees
        if (!isSourceNetworkToken) {
            cachedNetworkTokenPool.onFeesCollected(pool, tradeAmounts.feeAmount, TRADING_FEE);
        }

        emit TokensTraded({
            contextId: contextId,
            pool: pool,
            sourceToken: sourceToken,
            targetToken: targetToken,
            sourceAmount: sourceAmount,
            targetAmount: tradeAmounts.amount,
            trader: trader
        });

        emit FeesCollected({
            contextId: contextId,
            token: targetToken,
            feeType: TRADING_FEE,
            amount: tradeAmounts.feeAmount,
            stakedBalance: isSourceNetworkToken
                ? tradeAmounts.liquidity.stakedBalance
                : cachedNetworkTokenPool.stakedBalance()
        });

        emit TradingLiquidityUpdated({
            contextId: contextId,
            pool: pool,
            reserveToken: pool,
            liquidity: tradeAmounts.liquidity.baseTokenTradingLiquidity
        });

        emit TradingLiquidityUpdated({
            contextId: contextId,
            pool: pool,
            reserveToken: networkPool,
            liquidity: tradeAmounts.liquidity.networkTokenTradingLiquidity
        });

        return tradeAmounts.amount;
    }

    /**
     * @dev performs a double hop trade between two base tokens
     */
    function _tradeBaseTokens(
        bytes32 contextId,
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        address trader
    ) private returns (uint256) {
        // trade the source token to the network token (while accepting any return amount)
        uint256 tradeAmount = _tradeNetworkToken(contextId, sourceToken, false, sourceAmount, 1, trader);

        // trade the received network token target amount to the target token (while respecting the minimum return
        // amount)
        return _tradeNetworkToken(contextId, targetToken, true, tradeAmount, minReturnAmount, trader);
    }

    /**
     * @dev returns the target or source amount and fee by specifying the source and the target tokens and whether we're
     * interested in the target or source amount
     */
    function _tradeAmount(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 amount,
        bool targetAmount
    ) private view returns (uint256) {
        // return the trade amount and fee when trading the network token to the base token
        if (sourceToken.toIERC20() == _networkToken) {
            return
                _poolCollection(targetToken).tradeAmountAndFee(sourceToken, targetToken, amount, targetAmount).amount;
        }

        // return the trade amount and fee when trading the bsase token to the network token
        if (targetToken.toIERC20() == _networkToken) {
            return
                _poolCollection(sourceToken).tradeAmountAndFee(sourceToken, targetToken, amount, targetAmount).amount;
        }

        // return the trade amount and fee by simulating double-hop trade from the source token to the target token via
        // the network token
        TradeAmounts memory sourceTradeAmounts = _poolCollection(sourceToken).tradeAmountAndFee(
            sourceToken,
            ReserveToken.wrap(address(_networkToken)),
            amount,
            targetAmount
        );

        return
            _poolCollection(targetToken)
                .tradeAmountAndFee(
                    ReserveToken.wrap(address(_networkToken)),
                    targetToken,
                    sourceTradeAmounts.amount,
                    targetAmount
                )
                .amount;
    }

    /**
     * @dev deposits reserve tokens to the vault and verifies that msg.value corresponds to its type
     */
    function _depositToVault(
        ReserveToken reserveToken,
        address sender,
        uint256 amount
    ) private {
        if (msg.value > 0) {
            if (!reserveToken.isNativeToken()) {
                revert InvalidPool();
            }

            if (msg.value != amount) {
                revert EthAmountMismatch();
            }

            // using a regular transfer here would revert due to exceeding the 2300 gas limit which is why we're using
            // call instead (via sendValue), which the 2300 gas limit does not apply for
            payable(_vault).sendValue(amount);
        } else {
            if (reserveToken.isNativeToken()) {
                revert InvalidPool();
            }

            reserveToken.safeTransferFrom(sender, address(_vault), amount);
        }
    }

    /**
     * @dev verifies that the specified pool is managed by a valid pool collection and returns it
     */
    function _poolCollection(ReserveToken token) private view returns (IPoolCollection) {
        // verify that the pool is managed by a valid pool collection
        IPoolCollection poolCollection = _collectionByPool[token];
        if (address(poolCollection) == address(0)) {
            revert InvalidToken();
        }

        return poolCollection;
    }

    function migrateLiquidity(
        ReserveToken reserveToken,
        address provider,
        uint256 amount,
        uint256 availableTokens,
        uint256 originalAmount
    )
        external
        payable
        onlyRole(ROLE_MIGRATION_MANAGER)
    {
        bytes32 contextId = keccak256(
            abi.encodePacked(
                msg.sender,
                _time(),
                reserveToken,
                provider,
                amount,
                availableTokens,
                originalAmount
            )
        );

        if (reserveToken.toIERC20() == _networkToken) {
            _depositNetworkTokenFor(contextId, provider, amount, provider, true);
        } else {
            _depositBaseTokenFor(contextId, provider, reserveToken, amount, provider);
        }

        emit FundsMigrated(
            contextId,
            reserveToken,
            provider,
            amount,
            availableTokens
        );
    }
}

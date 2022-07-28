// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Time } from "../utility/Time.sol";
import { MathEx } from "../utility/MathEx.sol";

// prettier-ignore
import {
    Utils,
    AlreadyExists,
    DoesNotExist,
    InvalidToken,
    InvalidPool,
    InvalidPoolCollection,
    NotEmpty
} from "../utility/Utils.sol";

import { ROLE_ASSET_MANAGER } from "../vaults/interfaces/IVault.sol";
import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IPoolCollection, TradeAmountAndFee } from "../pools/interfaces/IPoolCollection.sol";
import { IPoolMigrator } from "../pools/interfaces/IPoolMigrator.sol";

// prettier-ignore
import {
    IBNTPool,
    ROLE_BNT_MANAGER,
    ROLE_VAULT_MANAGER,
    ROLE_FUNDING_MANAGER
} from "../pools/interfaces/IBNTPool.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";

import { INetworkSettings, NotWhitelisted } from "./interfaces/INetworkSettings.sol";
import { IPendingWithdrawals, CompletedWithdrawal } from "./interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork, IFlashLoanRecipient } from "./interfaces/IBancorNetwork.sol";

/**
 * @dev Bancor Network contract
 */
contract BancorNetwork is IBancorNetwork, Upgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, Time, Utils {
    using Address for address payable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using TokenLibrary for Token;
    using SafeERC20 for IPoolToken;

    error DeadlineExpired();
    error DepositingDisabled();
    error NativeTokenAmountMismatch();
    error InsufficientFlashLoanReturn();

    struct TradeParams {
        uint256 amount;
        uint256 limit;
        bool bySourceAmount;
    }

    struct TradeResult {
        uint256 sourceAmount;
        uint256 targetAmount;
        uint256 tradingFeeAmount;
        uint256 networkFeeAmount;
    }

    struct TradeTokens {
        Token sourceToken;
        Token targetToken;
    }

    struct TraderInfo {
        address trader;
        address beneficiary;
    }

    // the migration manager role is required for migrating liquidity
    bytes32 private constant ROLE_MIGRATION_MANAGER = keccak256("ROLE_MIGRATION_MANAGER");

    // the emergency manager role is required to pause/unpause the network
    bytes32 private constant ROLE_EMERGENCY_STOPPER = keccak256("ROLE_EMERGENCY_STOPPER");

    // the network fee manager role is required to pull the accumulated pending network fees
    bytes32 private constant ROLE_NETWORK_FEE_MANAGER = keccak256("ROLE_NETWORK_FEE_MANAGER");

    // the address of the BNT token
    IERC20 private immutable _bnt;

    // the address of the BNT token governance
    ITokenGovernance private immutable _bntGovernance;

    // the address of the vBNT token
    IERC20 private immutable _vbnt;

    // the address of the vBNT token governance
    ITokenGovernance private immutable _vbntGovernance;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the master vault contract
    IMasterVault private immutable _masterVault;

    // the address of the external protection vault
    IExternalProtectionVault private immutable _externalProtectionVault;

    // the BNT pool token
    IPoolToken internal immutable _bntPoolToken;

    // the BNT pool contract
    IBNTPool internal _bntPool;

    // the pending withdrawals contract
    IPendingWithdrawals internal _pendingWithdrawals;

    // the pool migrator contract
    IPoolMigrator internal _poolMigrator;

    // the set of all valid pool collections
    EnumerableSetUpgradeable.AddressSet private _poolCollections;

    // DEPRECATED (mapping(uint16 => IPoolCollection) _latestPoolCollections)
    uint256 private _deprecated0;

    // the set of all pools
    EnumerableSetUpgradeable.AddressSet private _liquidityPools;

    // a mapping between pools and their respective pool collections
    mapping(Token => IPoolCollection) private _collectionByPool;

    // the pending network fee amount to be burned by the vortex
    uint256 internal _pendingNetworkFeeAmount;

    bool private _depositingEnabled = true;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 11] private __gap;

    /**
     * @dev triggered when a new pool collection is added
     */
    event PoolCollectionAdded(uint16 indexed poolType, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when an existing pool collection is removed
     */
    event PoolCollectionRemoved(uint16 indexed poolType, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when a pool is created
     */
    event PoolCreated(Token indexed pool, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when a new pool is added to a pool collection
     */
    event PoolAdded(Token indexed pool, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when a new pool is removed from a pool collection
     */
    event PoolRemoved(Token indexed pool, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when funds are migrated
     */
    event FundsMigrated(
        bytes32 indexed contextId,
        Token indexed token,
        address indexed provider,
        uint256 amount,
        uint256 availableAmount,
        uint256 originalAmount
    );

    /**
     * @dev triggered on a successful trade
     */
    event TokensTraded(
        bytes32 indexed contextId,
        Token indexed sourceToken,
        Token indexed targetToken,
        uint256 sourceAmount,
        uint256 targetAmount,
        uint256 bntAmount,
        uint256 targetFeeAmount,
        uint256 bntFeeAmount,
        address trader
    );

    /**
     * @dev triggered when a flash-loan is completed
     */
    event FlashLoanCompleted(Token indexed token, address indexed borrower, uint256 amount, uint256 feeAmount);

    /**
     * @dev triggered when network fees are withdrawn
     */
    event NetworkFeesWithdrawn(address indexed caller, address indexed recipient, uint256 amount);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        ITokenGovernance initBNTGovernance,
        ITokenGovernance initVBNTGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IExternalProtectionVault initExternalProtectionVault,
        IPoolToken initBNTPoolToken
    )
        validAddress(address(initBNTGovernance))
        validAddress(address(initVBNTGovernance))
        validAddress(address(initNetworkSettings))
        validAddress(address(initMasterVault))
        validAddress(address(initExternalProtectionVault))
        validAddress(address(initBNTPoolToken))
    {
        _bntGovernance = initBNTGovernance;
        _bnt = initBNTGovernance.token();
        _vbntGovernance = initVBNTGovernance;
        _vbnt = initVBNTGovernance.token();

        _networkSettings = initNetworkSettings;
        _masterVault = initMasterVault;
        _externalProtectionVault = initExternalProtectionVault;
        _bntPoolToken = initBNTPoolToken;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize(
        IBNTPool initBNTPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolMigrator initPoolMigrator
    )
        external
        validAddress(address(initBNTPool))
        validAddress(address(initPendingWithdrawals))
        validAddress(address(initPoolMigrator))
        initializer
    {
        __BancorNetwork_init(initBNTPool, initPendingWithdrawals, initPoolMigrator);
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorNetwork_init(
        IBNTPool initBNTPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolMigrator initPoolMigrator
    ) internal onlyInitializing {
        __Upgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        __BancorNetwork_init_unchained(initBNTPool, initPendingWithdrawals, initPoolMigrator);
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorNetwork_init_unchained(
        IBNTPool initBNTPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolMigrator initPoolMigrator
    ) internal onlyInitializing {
        _bntPool = initBNTPool;
        _pendingWithdrawals = initPendingWithdrawals;
        _poolMigrator = initPoolMigrator;

        // set up administrative roles
        _setRoleAdmin(ROLE_MIGRATION_MANAGER, ROLE_ADMIN);
        _setRoleAdmin(ROLE_EMERGENCY_STOPPER, ROLE_ADMIN);
        _setRoleAdmin(ROLE_NETWORK_FEE_MANAGER, ROLE_ADMIN);

        _depositingEnabled = true;
    }

    // solhint-enable func-name-mixedcase

    modifier depositsEnabled() {
        _depositsEnabled();

        _;
    }

    function _depositsEnabled() internal view {
        if (!_depositingEnabled) {
            revert DepositingDisabled();
        }
    }

    receive() external payable {}

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 7;
    }

    /**
     * @dev returns the migration manager role
     */
    function roleMigrationManager() external pure returns (bytes32) {
        return ROLE_MIGRATION_MANAGER;
    }

    /**
     * @dev returns the emergency stopper role
     */
    function roleEmergencyStopper() external pure returns (bytes32) {
        return ROLE_EMERGENCY_STOPPER;
    }

    /**
     * @dev returns the network fee manager role
     */
    function roleNetworkFeeManager() external pure returns (bytes32) {
        return ROLE_NETWORK_FEE_MANAGER;
    }

    /**
     * @dev returns the pending network fee amount to be burned by the vortex
     */
    function pendingNetworkFeeAmount() external view returns (uint256) {
        return _pendingNetworkFeeAmount;
    }

    /**
     * @dev registers new pool collection with the network
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function registerPoolCollection(IPoolCollection newPoolCollection)
        external
        validAddress(address(newPoolCollection))
        onlyAdmin
        nonReentrant
    {
        // verify that there is no pool collection of the same type and version
        uint16 newPoolType = newPoolCollection.poolType();
        uint16 newPoolVersion = newPoolCollection.version();

        IPoolCollection poolCollection = _findPoolCollection(newPoolType, newPoolVersion);
        if (poolCollection != IPoolCollection(address(0)) || !_poolCollections.add(address(newPoolCollection))) {
            revert AlreadyExists();
        }

        _setAccessRoles(newPoolCollection, true);

        emit PoolCollectionAdded({ poolType: newPoolCollection.poolType(), poolCollection: newPoolCollection });
    }

    /**
     * @dev unregisters an existing pool collection from the network
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function unregisterPoolCollection(IPoolCollection poolCollection)
        external
        validAddress(address(poolCollection))
        onlyAdmin
        nonReentrant
    {
        // verify that no pools are associated with the specified pool collection
        if (poolCollection.poolCount() != 0) {
            revert NotEmpty();
        }

        if (!_poolCollections.remove(address(poolCollection))) {
            revert DoesNotExist();
        }

        _setAccessRoles(poolCollection, false);

        emit PoolCollectionRemoved({ poolType: poolCollection.poolType(), poolCollection: poolCollection });
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function poolCollections() external view returns (IPoolCollection[] memory) {
        uint256 length = _poolCollections.length();
        IPoolCollection[] memory list = new IPoolCollection[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = IPoolCollection(_poolCollections.at(i));
        }
        return list;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function liquidityPools() external view returns (Token[] memory) {
        uint256 length = _liquidityPools.length();
        Token[] memory list = new Token[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = Token(_liquidityPools.at(i));
        }
        return list;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function collectionByPool(Token pool) external view returns (IPoolCollection) {
        return _collectionByPool[pool];
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function createPools(Token[] calldata tokens, IPoolCollection poolCollection)
        external
        validAddress(address(poolCollection))
        onlyAdmin
        nonReentrant
    {
        if (!_poolCollections.contains(address(poolCollection))) {
            revert DoesNotExist();
        }

        uint256 length = tokens.length;
        for (uint256 i = 0; i < length; i++) {
            _createPool(tokens[i], poolCollection);
        }
    }

    /**
     * @dev creates a new pool
     */
    function _createPool(Token token, IPoolCollection poolCollection) private {
        _validAddress(address(token));

        if (token.isEqual(_bnt)) {
            revert InvalidToken();
        }

        if (!_liquidityPools.add(address(token))) {
            revert AlreadyExists();
        }

        // this is where the magic happens...
        poolCollection.createPool(token);

        // add the pool collection to the reverse pool collection lookup
        _collectionByPool[token] = poolCollection;

        emit PoolCreated({ pool: token, poolCollection: poolCollection });
        emit PoolAdded({ pool: token, poolCollection: poolCollection });
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function migratePools(Token[] calldata pools, IPoolCollection newPoolCollection) external nonReentrant {
        if (!_poolCollections.contains(address(newPoolCollection))) {
            revert DoesNotExist();
        }

        uint256 length = pools.length;
        for (uint256 i = 0; i < length; i++) {
            Token pool = pools[i];

            // request the pool migrator to migrate the pool to the new pool collection
            _poolMigrator.migratePool(pool, newPoolCollection);

            IPoolCollection prevPoolCollection = _collectionByPool[pool];

            // update the mapping between pools and their respective pool collections
            _collectionByPool[pool] = newPoolCollection;

            emit PoolRemoved(pool, prevPoolCollection);
            emit PoolAdded(pool, newPoolCollection);
        }
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function depositFor(
        address provider,
        Token pool,
        uint256 tokenAmount
    )
        external
        payable
        depositsEnabled
        validAddress(provider)
        validAddress(address(pool))
        greaterThanZero(tokenAmount)
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return _depositFor(provider, pool, tokenAmount, msg.sender);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function deposit(Token pool, uint256 tokenAmount)
        external
        payable
        depositsEnabled
        validAddress(address(pool))
        greaterThanZero(tokenAmount)
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return _depositFor(msg.sender, pool, tokenAmount, msg.sender);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function initWithdrawal(IPoolToken poolToken, uint256 poolTokenAmount)
        external
        validAddress(address(poolToken))
        greaterThanZero(poolTokenAmount)
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return _initWithdrawal(msg.sender, poolToken, poolTokenAmount);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function cancelWithdrawal(uint256 id) external whenNotPaused nonReentrant returns (uint256) {
        return _pendingWithdrawals.cancelWithdrawal(msg.sender, id);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function withdraw(uint256 id) external whenNotPaused nonReentrant returns (uint256) {
        address provider = msg.sender;
        bytes32 contextId = _withdrawContextId(id, provider);

        // complete the withdrawal and claim the locked pool tokens
        CompletedWithdrawal memory completedRequest = _pendingWithdrawals.completeWithdrawal(contextId, provider, id);

        if (completedRequest.poolToken == _bntPoolToken) {
            return _withdrawBNT(contextId, provider, completedRequest);
        }

        return _withdrawBaseToken(contextId, provider, completedRequest);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function tradeBySourceAmount(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        _verifyTradeParams(sourceToken, targetToken, sourceAmount, minReturnAmount, deadline);

        return
            _trade(
                TradeTokens({ sourceToken: sourceToken, targetToken: targetToken }),
                TradeParams({ bySourceAmount: true, amount: sourceAmount, limit: minReturnAmount }),
                TraderInfo({ trader: msg.sender, beneficiary: beneficiary }),
                deadline
            );
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function tradeByTargetAmount(
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount,
        uint256 maxSourceAmount,
        uint256 deadline,
        address beneficiary
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        _verifyTradeParams(sourceToken, targetToken, targetAmount, maxSourceAmount, deadline);

        return
            _trade(
                TradeTokens({ sourceToken: sourceToken, targetToken: targetToken }),
                TradeParams({ bySourceAmount: false, amount: targetAmount, limit: maxSourceAmount }),
                TraderInfo({ trader: msg.sender, beneficiary: beneficiary }),
                deadline
            );
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function flashLoan(
        Token token,
        uint256 amount,
        IFlashLoanRecipient recipient,
        bytes calldata data
    )
        external
        validAddress(address(token))
        greaterThanZero(amount)
        validAddress(address(recipient))
        whenNotPaused
        nonReentrant
    {
        if (!token.isEqual(_bnt) && !_networkSettings.isTokenWhitelisted(token)) {
            revert NotWhitelisted();
        }

        uint256 feeAmount = MathEx.mulDivF(amount, _networkSettings.flashLoanFeePPM(token), PPM_RESOLUTION);

        // save the current balance
        uint256 prevBalance = token.balanceOf(address(this));

        // transfer the amount from the master vault to the recipient
        _masterVault.withdrawFunds(token, payable(address(recipient)), amount);

        // invoke the recipient's callback
        recipient.onFlashLoan(msg.sender, token.toIERC20(), amount, feeAmount, data);

        // ensure that the tokens + fee have been deposited back to the network
        uint256 returnedAmount = token.balanceOf(address(this)) - prevBalance;
        if (returnedAmount < amount + feeAmount) {
            revert InsufficientFlashLoanReturn();
        }

        // transfer the amount and the fee back to the vault
        if (token.isNative()) {
            payable(address(_masterVault)).sendValue(returnedAmount);
        } else {
            token.safeTransfer(payable(address(_masterVault)), returnedAmount);
        }

        // notify the pool of accrued fees
        if (token.isEqual(_bnt)) {
            IBNTPool cachedBNTPool = _bntPool;

            cachedBNTPool.onFeesCollected(token, feeAmount, false);
        } else {
            // get the pool and verify that it exists
            IPoolCollection poolCollection = _poolCollection(token);
            poolCollection.onFeesCollected(token, feeAmount);
        }

        emit FlashLoanCompleted({ token: token, borrower: msg.sender, amount: amount, feeAmount: feeAmount });
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function migrateLiquidity(
        Token token,
        address provider,
        uint256 amount,
        uint256 availableAmount,
        uint256 originalAmount
    ) external payable whenNotPaused onlyRoleMember(ROLE_MIGRATION_MANAGER) nonReentrant {
        bytes32 contextId = keccak256(
            abi.encodePacked(msg.sender, _time(), token, provider, amount, availableAmount, originalAmount)
        );

        if (token.isEqual(_bnt)) {
            _depositBNTFor(contextId, provider, amount, msg.sender, true, originalAmount);
        } else {
            _depositBaseTokenFor(contextId, provider, token, amount, msg.sender, availableAmount);
        }

        emit FundsMigrated(contextId, token, provider, amount, availableAmount, originalAmount);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function withdrawNetworkFees(address recipient)
        external
        whenNotPaused
        onlyRoleMember(ROLE_NETWORK_FEE_MANAGER)
        validAddress(recipient)
        nonReentrant
        returns (uint256)
    {
        uint256 currentPendingNetworkFeeAmount = _pendingNetworkFeeAmount;
        if (currentPendingNetworkFeeAmount == 0) {
            return 0;
        }

        _pendingNetworkFeeAmount = 0;

        _masterVault.withdrawFunds(Token(address(_bnt)), payable(recipient), currentPendingNetworkFeeAmount);

        emit NetworkFeesWithdrawn(msg.sender, recipient, currentPendingNetworkFeeAmount);

        return currentPendingNetworkFeeAmount;
    }

    /**
     * @dev pauses the network
     *
     * requirements:
     *
     * - the caller must have the ROLE_EMERGENCY_STOPPER privilege
     */
    function pause() external onlyRoleMember(ROLE_EMERGENCY_STOPPER) {
        _pause();
    }

    /**
     * @dev resumes the network
     *
     * requirements:
     *
     * - the caller must have the ROLE_EMERGENCY_STOPPER privilege
     */
    function resume() external onlyRoleMember(ROLE_EMERGENCY_STOPPER) {
        _unpause();
    }

    /**
     * @dev returns whether deposits are enabled
     */
    function depositingEnabled() external view returns (bool) {
        return _depositingEnabled;
    }

    /**
     * @dev enables/disables depositing into a given pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function enableDepositing(bool status) external onlyAdmin {
        if (_depositingEnabled == status) {
            return;
        }

        _depositingEnabled = status;
    }

    /**
     * @dev generates context ID for a deposit request
     */
    function _depositContextId(
        address provider,
        Token pool,
        uint256 tokenAmount,
        address caller
    ) private view returns (bytes32) {
        return keccak256(abi.encodePacked(caller, _time(), provider, pool, tokenAmount));
    }

    /**
     * @dev generates context ID for a withdraw request
     */
    function _withdrawContextId(uint256 id, address caller) private view returns (bytes32) {
        return keccak256(abi.encodePacked(caller, _time(), id));
    }

    /**
     * @dev deposits liquidity for the specified provider from caller
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the liquidity tokens on its behalf
     */
    function _depositFor(
        address provider,
        Token pool,
        uint256 tokenAmount,
        address caller
    ) private returns (uint256) {
        bytes32 contextId = _depositContextId(provider, pool, tokenAmount, caller);

        if (pool.isEqual(_bnt)) {
            return _depositBNTFor(contextId, provider, tokenAmount, caller, false, 0);
        }

        return _depositBaseTokenFor(contextId, provider, pool, tokenAmount, caller, tokenAmount);
    }

    /**
     * @dev deposits BNT liquidity for the specified provider from caller
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer BNT on its behalf
     */
    function _depositBNTFor(
        bytes32 contextId,
        address provider,
        uint256 bntAmount,
        address caller,
        bool isMigrating,
        uint256 originalAmount
    ) private returns (uint256) {
        if (msg.value > 0) {
            revert NativeTokenAmountMismatch();
        }

        IBNTPool cachedBNTPool = _bntPool;

        // transfer the tokens from the caller to the BNT pool
        _bnt.transferFrom(caller, address(cachedBNTPool), bntAmount);

        // process BNT pool deposit
        return cachedBNTPool.depositFor(contextId, provider, bntAmount, isMigrating, originalAmount);
    }

    /**
     * @dev deposits base token liquidity for the specified provider from sender
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer base tokens to on its behalf
     */
    function _depositBaseTokenFor(
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 tokenAmount,
        address caller,
        uint256 availableAmount
    ) private returns (uint256) {
        // transfer the tokens from the sender to the vault
        _depositToMasterVault(pool, caller, availableAmount);

        // get the pool collection that managed this pool
        IPoolCollection poolCollection = _poolCollection(pool);

        // process deposit to the base token pool (includes the native token pool)
        return poolCollection.depositFor(contextId, provider, pool, tokenAmount);
    }

    /**
     * @dev handles BNT withdrawal
     */
    function _withdrawBNT(
        bytes32 contextId,
        address provider,
        CompletedWithdrawal memory completedRequest
    ) private returns (uint256) {
        IBNTPool cachedBNTPool = _bntPool;

        // transfer the pool tokens to from the pending withdrawals contract to the BNT pool
        completedRequest.poolToken.transferFrom(
            address(_pendingWithdrawals),
            address(cachedBNTPool),
            completedRequest.poolTokenAmount
        );

        // transfer vBNT from the caller to the BNT pool
        _vbnt.transferFrom(provider, address(cachedBNTPool), completedRequest.poolTokenAmount);

        // call withdraw on the BNT pool
        return
            cachedBNTPool.withdraw(
                contextId,
                provider,
                completedRequest.poolTokenAmount,
                completedRequest.reserveTokenAmount
            );
    }

    /**
     * @dev handles base token withdrawal
     */
    function _withdrawBaseToken(
        bytes32 contextId,
        address provider,
        CompletedWithdrawal memory completedRequest
    ) private returns (uint256) {
        Token pool = completedRequest.poolToken.reserveToken();

        // get the pool collection that manages this pool
        IPoolCollection poolCollection = _poolCollection(pool);

        // transfer the pool tokens to from the pending withdrawals contract to the pool collection
        completedRequest.poolToken.transferFrom(
            address(_pendingWithdrawals),
            address(poolCollection),
            completedRequest.poolTokenAmount
        );

        // call withdraw on the base token pool - returns the amounts/breakdown
        return
            poolCollection.withdraw(
                contextId,
                provider,
                pool,
                completedRequest.poolTokenAmount,
                completedRequest.reserveTokenAmount
            );
    }

    /**
     * @dev verifies that the provided trade params are valid
     */
    function _verifyTradeParams(
        Token sourceToken,
        Token targetToken,
        uint256 amount,
        uint256 limit,
        uint256 deadline
    ) internal view {
        _validAddress(address(sourceToken));
        _validAddress(address(targetToken));

        if (sourceToken == targetToken) {
            revert InvalidToken();
        }

        _greaterThanZero(amount);
        _greaterThanZero(limit);

        if (deadline < _time()) {
            revert DeadlineExpired();
        }
    }

    /**
     * @dev performs a trade by providing either the source or target amount:
     *
     * - when trading by the source amount, the amount represents the source amount and the limit is the minimum return
     *   amount
     * - when trading by the target amount, the amount represents the target amount and the limit is the maximum source
     *   amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the source tokens on its behalf (except for in the
     *   native token case)
     */
    function _trade(
        TradeTokens memory tokens,
        TradeParams memory params,
        TraderInfo memory traderInfo,
        uint256 deadline
    ) private returns (uint256) {
        // ensure the beneficiary is set
        if (traderInfo.beneficiary == address(0)) {
            traderInfo.beneficiary = traderInfo.trader;
        }

        bytes32 contextId = keccak256(
            abi.encodePacked(
                traderInfo.trader,
                _time(),
                tokens.sourceToken,
                tokens.targetToken,
                params.amount,
                params.limit,
                params.bySourceAmount,
                deadline,
                traderInfo.beneficiary
            )
        );

        // perform either a single or double hop trade, based on the source and the target pool
        TradeResult memory firstHopTradeResult;
        TradeResult memory lastHopTradeResult;
        uint256 networkFeeAmount;

        if (tokens.sourceToken.isEqual(_bnt)) {
            lastHopTradeResult = _tradeBNT(contextId, tokens.targetToken, true, params);

            firstHopTradeResult = lastHopTradeResult;

            networkFeeAmount = lastHopTradeResult.networkFeeAmount;

            emit TokensTraded({
                contextId: contextId,
                sourceToken: tokens.sourceToken,
                targetToken: tokens.targetToken,
                sourceAmount: lastHopTradeResult.sourceAmount,
                targetAmount: lastHopTradeResult.targetAmount,
                bntAmount: lastHopTradeResult.sourceAmount,
                targetFeeAmount: lastHopTradeResult.tradingFeeAmount,
                bntFeeAmount: 0,
                trader: traderInfo.trader
            });
        } else if (tokens.targetToken.isEqual(_bnt)) {
            lastHopTradeResult = _tradeBNT(contextId, tokens.sourceToken, false, params);

            firstHopTradeResult = lastHopTradeResult;

            networkFeeAmount = lastHopTradeResult.networkFeeAmount;

            emit TokensTraded({
                contextId: contextId,
                sourceToken: tokens.sourceToken,
                targetToken: tokens.targetToken,
                sourceAmount: lastHopTradeResult.sourceAmount,
                targetAmount: lastHopTradeResult.targetAmount,
                bntAmount: lastHopTradeResult.targetAmount,
                targetFeeAmount: lastHopTradeResult.tradingFeeAmount,
                bntFeeAmount: lastHopTradeResult.tradingFeeAmount,
                trader: traderInfo.trader
            });
        } else {
            (firstHopTradeResult, lastHopTradeResult) = _tradeBaseTokens(contextId, tokens, params);

            networkFeeAmount = firstHopTradeResult.networkFeeAmount + lastHopTradeResult.networkFeeAmount;

            emit TokensTraded({
                contextId: contextId,
                sourceToken: tokens.sourceToken,
                targetToken: tokens.targetToken,
                sourceAmount: firstHopTradeResult.sourceAmount,
                targetAmount: lastHopTradeResult.targetAmount,
                bntAmount: firstHopTradeResult.targetAmount,
                targetFeeAmount: lastHopTradeResult.tradingFeeAmount,
                bntFeeAmount: firstHopTradeResult.tradingFeeAmount,
                trader: traderInfo.trader
            });
        }

        // transfer the tokens from the trader to the vault
        _depositToMasterVault(tokens.sourceToken, traderInfo.trader, firstHopTradeResult.sourceAmount);

        // transfer the target tokens/native token to the beneficiary
        _masterVault.withdrawFunds(
            tokens.targetToken,
            payable(traderInfo.beneficiary),
            lastHopTradeResult.targetAmount
        );

        // update the pending network fee amount to be burned by the vortex
        _pendingNetworkFeeAmount += networkFeeAmount;

        return params.bySourceAmount ? lastHopTradeResult.targetAmount : firstHopTradeResult.sourceAmount;
    }

    /**
     * @dev performs a single hop between BNT and a base token trade by providing either the source or the target amount
     *
     * - when trading by the source amount, the amount represents the source amount and the limit is the minimum return
     *   amount
     * - when trading by the target amount, the amount represents the target amount and the limit is the maximum source
     *   amount
     */
    function _tradeBNT(
        bytes32 contextId,
        Token pool,
        bool fromBNT,
        TradeParams memory params
    ) private returns (TradeResult memory) {
        TradeTokens memory tokens = fromBNT
            ? TradeTokens({ sourceToken: Token(address(_bnt)), targetToken: pool })
            : TradeTokens({ sourceToken: pool, targetToken: Token(address(_bnt)) });

        TradeAmountAndFee memory tradeAmountsAndFee = params.bySourceAmount
            ? _poolCollection(pool).tradeBySourceAmount(
                contextId,
                tokens.sourceToken,
                tokens.targetToken,
                params.amount,
                params.limit
            )
            : _poolCollection(pool).tradeByTargetAmount(
                contextId,
                tokens.sourceToken,
                tokens.targetToken,
                params.amount,
                params.limit
            );

        // if the target token is BNT, notify the BNT pool on collected fees (which shouldn't include the network fee
        // amount, so we have to deduct it explicitly from the full trading fee amount)
        if (!fromBNT) {
            _bntPool.onFeesCollected(
                pool,
                tradeAmountsAndFee.tradingFeeAmount - tradeAmountsAndFee.networkFeeAmount,
                true
            );
        }

        return
            TradeResult({
                sourceAmount: params.bySourceAmount ? params.amount : tradeAmountsAndFee.amount,
                targetAmount: params.bySourceAmount ? tradeAmountsAndFee.amount : params.amount,
                tradingFeeAmount: tradeAmountsAndFee.tradingFeeAmount,
                networkFeeAmount: tradeAmountsAndFee.networkFeeAmount
            });
    }

    /**
     * @dev performs a double hop trade between two base tokens by providing either the source or the target amount
     *
     * - when trading by the source amount, the amount represents the source amount and the limit is the minimum return
     *   amount
     * - when trading by the target amount, the amount represents the target amount and the limit is the maximum source
     *   amount
     */
    function _tradeBaseTokens(
        bytes32 contextId,
        TradeTokens memory tokens,
        TradeParams memory params
    ) private returns (TradeResult memory, TradeResult memory) {
        if (params.bySourceAmount) {
            uint256 sourceAmount = params.amount;
            uint256 minReturnAmount = params.limit;

            // trade source tokens to BNT (while accepting any return amount)
            TradeResult memory targetHop1 = _tradeBNT(
                contextId,
                tokens.sourceToken,
                false,
                TradeParams({ bySourceAmount: true, amount: sourceAmount, limit: 1 })
            );

            // trade the received BNT target amount to target tokens (while respecting the minimum return amount)
            TradeResult memory targetHop2 = _tradeBNT(
                contextId,
                tokens.targetToken,
                true,
                TradeParams({ bySourceAmount: true, amount: targetHop1.targetAmount, limit: minReturnAmount })
            );

            return (targetHop1, targetHop2);
        }

        uint256 targetAmount = params.amount;
        uint256 maxSourceAmount = params.limit;

        // trade any amount of BNT to get the requested target amount (we will use the actual traded amount to restrict
        // the trade from the source)
        TradeResult memory sourceHop2 = _tradeBNT(
            contextId,
            tokens.targetToken,
            true,
            TradeParams({ bySourceAmount: false, amount: targetAmount, limit: type(uint256).max })
        );

        // trade source tokens to the required amount of BNT (while respecting the maximum source amount)
        TradeResult memory sourceHop1 = _tradeBNT(
            contextId,
            tokens.sourceToken,
            false,
            TradeParams({ bySourceAmount: false, amount: sourceHop2.sourceAmount, limit: maxSourceAmount })
        );

        return (sourceHop1, sourceHop2);
    }

    /**
     * @dev deposits tokens to the master vault and verifies that msg.value corresponds to its type
     */
    function _depositToMasterVault(
        Token token,
        address caller,
        uint256 amount
    ) private {
        if (token.isNative()) {
            if (msg.value < amount) {
                revert NativeTokenAmountMismatch();
            }

            // using a regular transfer here would revert due to exceeding the 2300 gas limit which is why we're using
            // call instead (via sendValue), which the 2300 gas limit does not apply for
            payable(address(_masterVault)).sendValue(amount);

            // refund the caller for the remaining native token amount
            if (msg.value > amount) {
                payable(address(caller)).sendValue(msg.value - amount);
            }
        } else {
            if (msg.value > 0) {
                revert NativeTokenAmountMismatch();
            }

            token.safeTransferFrom(caller, address(_masterVault), amount);
        }
    }

    /**
     * @dev verifies that the specified pool is managed by a valid pool collection and returns it
     */
    function _poolCollection(Token token) private view returns (IPoolCollection) {
        // verify that the pool is managed by a valid pool collection
        IPoolCollection poolCollection = _collectionByPool[token];
        if (address(poolCollection) == address(0)) {
            revert InvalidToken();
        }

        return poolCollection;
    }

    /**
     * @dev initiates liquidity withdrawal
     */
    function _initWithdrawal(
        address provider,
        IPoolToken poolToken,
        uint256 poolTokenAmount
    ) private returns (uint256) {
        if (poolToken != _bntPoolToken) {
            Token reserveToken = poolToken.reserveToken();
            if (_poolCollection(reserveToken).poolToken(reserveToken) != poolToken) {
                revert InvalidPool();
            }
        }

        // transfer the pool tokens from the provider (we aren't using safeTransferFrom, since the PoolToken is a fully
        // compliant ERC20 token contract)
        poolToken.transferFrom(provider, address(_pendingWithdrawals), poolTokenAmount);

        return _pendingWithdrawals.initWithdrawal(provider, poolToken, poolTokenAmount);
    }

    /**
     * @dev grants/revokes required roles to/from a pool collection
     */
    function _setAccessRoles(IPoolCollection poolCollection, bool set) private {
        address poolCollectionAddress = address(poolCollection);

        if (set) {
            _bntPool.grantRole(ROLE_BNT_MANAGER, poolCollectionAddress);
            _bntPool.grantRole(ROLE_VAULT_MANAGER, poolCollectionAddress);
            _bntPool.grantRole(ROLE_FUNDING_MANAGER, poolCollectionAddress);
            _masterVault.grantRole(ROLE_ASSET_MANAGER, poolCollectionAddress);
            _externalProtectionVault.grantRole(ROLE_ASSET_MANAGER, poolCollectionAddress);
        } else {
            _bntPool.revokeRole(ROLE_BNT_MANAGER, poolCollectionAddress);
            _bntPool.revokeRole(ROLE_VAULT_MANAGER, poolCollectionAddress);
            _bntPool.revokeRole(ROLE_FUNDING_MANAGER, poolCollectionAddress);
            _masterVault.revokeRole(ROLE_ASSET_MANAGER, poolCollectionAddress);
            _externalProtectionVault.revokeRole(ROLE_ASSET_MANAGER, poolCollectionAddress);
        }
    }

    /*
     * @dev finds a pool collection with the given type and version
     */
    function _findPoolCollection(uint16 poolType, uint16 poolVersion) private view returns (IPoolCollection) {
        // note that there's no risk of using an unbounded loop here since the list of all the active pool collections
        // is always going to remain sufficiently small
        uint256 length = _poolCollections.length();
        for (uint256 i = 0; i < length; i++) {
            IPoolCollection poolCollection = IPoolCollection(_poolCollections.at(i));
            if ((poolCollection.poolType() == poolType && poolCollection.version() == poolVersion)) {
                return poolCollection;
            }
        }

        return IPoolCollection(address(0));
    }
}

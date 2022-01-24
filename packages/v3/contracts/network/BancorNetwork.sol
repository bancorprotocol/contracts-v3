// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";

import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Time } from "../utility/Time.sol";
import { MathEx, uncheckedInc } from "../utility/MathEx.sol";

// prettier-ignore
import {
    Utils,
    AlreadyExists,
    DoesNotExist,
    InvalidPool,
    InvalidToken,
    InvalidType,
    NotEmpty } from "../utility/Utils.sol";

import { ROLE_ASSET_MANAGER } from "../vaults/interfaces/IVault.sol";
import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

// prettier-ignore
import {
    IPoolCollection,
    PoolLiquidity,
    TradeAmountsWithLiquidity
} from "../pools/interfaces/IPoolCollection.sol";

import { IPoolCollectionUpgrader } from "../pools/interfaces/IPoolCollectionUpgrader.sol";

// prettier-ignore
import {
    IMasterPool,
    ROLE_NETWORK_TOKEN_MANAGER,
    ROLE_VAULT_MANAGER,
    ROLE_FUNDING_MANAGER
} from "../pools/interfaces/IMasterPool.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";

import { INetworkSettings, NotWhitelisted } from "./interfaces/INetworkSettings.sol";
import { IPendingWithdrawals, WithdrawalRequest, CompletedWithdrawal } from "./interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork, IFlashLoanRecipient } from "./interfaces/IBancorNetwork.sol";

import { TRADING_FEE, FLASH_LOAN_FEE } from "./FeeTypes.sol";

/**
 * @dev Bancor Network contract
 */
contract BancorNetwork is IBancorNetwork, Upgradeable, ReentrancyGuardUpgradeable, Time, Utils {
    using Address for address payable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using ReserveTokenLibrary for ReserveToken;
    using SafeERC20 for IPoolToken;

    error DeadlineExpired();
    error EthAmountMismatch();
    error InvalidTokens();
    error PermitUnsupported();
    error InsufficientFlashLoanReturn();

    // the migration manager role is required for migrating liquidity
    bytes32 private constant ROLE_MIGRATION_MANAGER = keccak256("ROLE_MIGRATION_MANAGER");

    // the address of the network token
    IERC20 private immutable _networkToken;

    // the address of the network token governance
    ITokenGovernance private immutable _networkTokenGovernance;

    // the address of the governance token
    IERC20 private immutable _govToken;

    // the address of the governance token governance
    ITokenGovernance private immutable _govTokenGovernance;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the master vault contract
    IMasterVault private immutable _masterVault;

    // the address of the external protection vault
    IExternalProtectionVault private immutable _externalProtectionVault;

    // the master pool token
    IPoolToken internal immutable _masterPoolToken;

    // the master pool contract
    IMasterPool internal _masterPool;

    // the pending withdrawals contract
    IPendingWithdrawals internal _pendingWithdrawals;

    // the pool collection upgrader contract
    IPoolCollectionUpgrader internal _poolCollectionUpgrader;

    // the set of all valid pool collections
    EnumerableSetUpgradeable.AddressSet private _poolCollections;

    // a mapping between the last pool collection that was added to the pool collections set and its type
    mapping(uint16 => IPoolCollection) private _latestPoolCollections;

    // the set of all pools
    EnumerableSetUpgradeable.AddressSet private _liquidityPools;

    // a mapping between pools and their respective pool collections
    mapping(ReserveToken => IPoolCollection) private _collectionByPool;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 9] private __gap;

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
     * @dev triggered when funds are migrated
     */
    event FundsMigrated(
        bytes32 indexed contextId,
        ReserveToken indexed token,
        address indexed provider,
        uint256 amount,
        uint256 availableAmount
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
    event FeesCollected(bytes32 indexed contextId, ReserveToken indexed token, uint8 indexed feeType, uint256 amount);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IExternalProtectionVault initExternalProtectionVault,
        IPoolToken initMasterPoolToken
    )
        validAddress(address(initNetworkTokenGovernance))
        validAddress(address(initGovTokenGovernance))
        validAddress(address(initNetworkSettings))
        validAddress(address(initMasterVault))
        validAddress(address(initExternalProtectionVault))
        validAddress(address(initMasterPoolToken))
    {
        _networkTokenGovernance = initNetworkTokenGovernance;
        _networkToken = initNetworkTokenGovernance.token();
        _govTokenGovernance = initGovTokenGovernance;
        _govToken = initGovTokenGovernance.token();

        _networkSettings = initNetworkSettings;
        _masterVault = initMasterVault;
        _externalProtectionVault = initExternalProtectionVault;
        _masterPoolToken = initMasterPoolToken;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize(
        IMasterPool initMasterPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    )
        external
        validAddress(address(initMasterPool))
        validAddress(address(initPendingWithdrawals))
        validAddress(address(initPoolCollectionUpgrader))
        initializer
    {
        __BancorNetwork_init(initMasterPool, initPendingWithdrawals, initPoolCollectionUpgrader);
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorNetwork_init(
        IMasterPool initMasterPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    ) internal onlyInitializing {
        __Upgradeable_init();
        __ReentrancyGuard_init();

        __BancorNetwork_init_unchained(initMasterPool, initPendingWithdrawals, initPoolCollectionUpgrader);
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorNetwork_init_unchained(
        IMasterPool initMasterPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    ) internal onlyInitializing {
        _masterPool = initMasterPool;
        _pendingWithdrawals = initPendingWithdrawals;
        _poolCollectionUpgrader = initPoolCollectionUpgrader;

        // set up administrative roles
        _setRoleAdmin(ROLE_MIGRATION_MANAGER, ROLE_ADMIN);
    }

    // solhint-enable func-name-mixedcase

    receive() external payable {}

    modifier validTokensForTrade(ReserveToken sourceToken, ReserveToken targetToken) {
        _validTokensForTrade(sourceToken, targetToken);

        _;
    }

    /**
     * @dev validates that the provided tokens are valid and unique
     */
    function _validTokensForTrade(ReserveToken sourceToken, ReserveToken targetToken) internal pure {
        _validAddress(ReserveToken.unwrap(sourceToken));
        _validAddress(ReserveToken.unwrap(targetToken));

        if (ReserveToken.unwrap(sourceToken) == ReserveToken.unwrap(targetToken)) {
            revert InvalidTokens();
        }
    }

    /**
     * @inheritdoc IVersioned
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @dev returns the migration manager role
     */
    function roleMigrationManager() external pure returns (bytes32) {
        return ROLE_MIGRATION_MANAGER;
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
        _setAccessRoles(poolCollection, true);

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
        _setAccessRoles(poolCollection, false);

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
        if (_isNetworkToken(reserveToken)) {
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

        if (completedRequest.poolToken == _masterPoolToken) {
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
     * @inheritdoc IBancorNetwork
     */
    function flashLoan(
        ReserveToken token,
        uint256 amount,
        IFlashLoanRecipient recipient,
        bytes calldata data
    )
        external
        nonReentrant
        validAddress(ReserveToken.unwrap(token))
        greaterThanZero(amount)
        validAddress(address(recipient))
    {
        if (!_isNetworkToken(token) && !_networkSettings.isTokenWhitelisted(token)) {
            revert NotWhitelisted();
        }

        uint256 feeAmount = MathEx.mulDivF(amount, _networkSettings.flashLoanFeePPM(), PPM_RESOLUTION);

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
        if (token.isNativeToken()) {
            payable(address(_masterVault)).sendValue(returnedAmount);
        } else {
            token.safeTransfer(payable(address(_masterVault)), returnedAmount);
        }

        // notify the pool of accrued fees
        if (_isNetworkToken(token)) {
            IMasterPool cachedMasterPool = _masterPool;

            cachedMasterPool.onFeesCollected(token, feeAmount, FLASH_LOAN_FEE);
        } else {
            // get the pool and verify that it exists
            IPoolCollection poolCollection = _poolCollection(token);
            poolCollection.onFeesCollected(token, feeAmount);
        }

        bytes32 contextId = keccak256(abi.encodePacked(msg.sender, _time(), token, amount, recipient, data));

        emit FlashLoanCompleted({ contextId: contextId, token: token, borrower: msg.sender, amount: amount });

        emit FeesCollected({ contextId: contextId, token: token, feeType: FLASH_LOAN_FEE, amount: feeAmount });
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function initWithdrawal(IPoolToken poolToken, uint256 poolTokenAmount)
        external
        validAddress(address(poolToken))
        greaterThanZero(poolTokenAmount)
        nonReentrant
        returns (uint256)
    {
        return _initWithdrawal(msg.sender, poolToken, poolTokenAmount);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function initWithdrawalPermitted(
        IPoolToken poolToken,
        uint256 poolTokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external validAddress(address(poolToken)) greaterThanZero(poolTokenAmount) nonReentrant returns (uint256) {
        poolToken.permit(msg.sender, address(this), poolTokenAmount, deadline, v, r, s);

        return _initWithdrawal(msg.sender, poolToken, poolTokenAmount);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function cancelWithdrawal(uint256 id) external nonReentrant {
        _pendingWithdrawals.cancelWithdrawal(msg.sender, id);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function reinitWithdrawal(uint256 id) external nonReentrant {
        _pendingWithdrawals.reinitWithdrawal(msg.sender, id);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function migrateLiquidity(
        ReserveToken reserveToken,
        address provider,
        uint256 amount,
        uint256 availableAmount,
        uint256 originalAmount
    ) external payable nonReentrant onlyRoleMember(ROLE_MIGRATION_MANAGER) {
        bytes32 contextId = keccak256(
            abi.encodePacked(msg.sender, _time(), reserveToken, provider, amount, availableAmount, originalAmount)
        );

        if (_isNetworkToken(reserveToken)) {
            _depositNetworkTokenFor(contextId, provider, amount, msg.sender, true, originalAmount);
        } else {
            _depositBaseTokenFor(contextId, provider, reserveToken, amount, msg.sender, availableAmount);
        }

        emit FundsMigrated(contextId, reserveToken, provider, amount, availableAmount);
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
     * @dev generates context ID for a deposit request
     */
    function _depositContextId(
        address provider,
        ReserveToken pool,
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
        ReserveToken pool,
        uint256 tokenAmount,
        address caller
    ) private {
        bytes32 contextId = _depositContextId(provider, pool, tokenAmount, caller);

        if (_isNetworkToken(pool)) {
            _depositNetworkTokenFor(contextId, provider, tokenAmount, caller, false, 0);
        } else {
            _depositBaseTokenFor(contextId, provider, pool, tokenAmount, caller, tokenAmount);
        }
    }

    /**
     * @dev deposits network token liquidity for the specified provider from caller
     *
     * requirements:
     *
     * - the caller must have approved have approved the network to transfer network tokens to on its behalf
     */
    function _depositNetworkTokenFor(
        bytes32 contextId,
        address provider,
        uint256 networkTokenAmount,
        address caller,
        bool isMigrating,
        uint256 originalAmount
    ) private {
        IMasterPool cachedMasterPool = _masterPool;

        // transfer the tokens from the caller to the master pool
        _networkToken.transferFrom(caller, address(cachedMasterPool), networkTokenAmount);

        // process master pool deposit
        cachedMasterPool.depositFor(contextId, provider, networkTokenAmount, isMigrating, originalAmount);
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
        uint256 tokenAmount,
        address caller,
        uint256 availableAmount
    ) private {
        // transfer the tokens from the sender to the vault
        _depositToMasterVault(pool, caller, availableAmount);

        // get the pool collection that managed this pool
        IPoolCollection poolCollection = _poolCollection(pool);

        // process deposit to the base token pool (taking into account the ETH pool)
        poolCollection.depositFor(contextId, provider, pool, tokenAmount);
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
        address caller
    ) private {
        // neither the network token nor ETH support EIP2612 permit requests
        if (_isNetworkToken(token) || token.isNativeToken()) {
            revert PermitUnsupported();
        }

        // permit the amount the caller is trying to deposit. Please note, that if the base token doesn't support
        // EIP2612 permit - either this call or the inner safeTransferFrom will revert
        IERC20Permit(ReserveToken.unwrap(token)).permit(caller, address(this), tokenAmount, deadline, v, r, s);
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
        address caller = msg.sender;

        _permit(pool, tokenAmount, deadline, v, r, s, caller);

        _depositBaseTokenFor(
            _depositContextId(provider, pool, tokenAmount, caller),
            provider,
            pool,
            tokenAmount,
            caller,
            tokenAmount
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
        IMasterPool cachedMasterPool = _masterPool;

        // approve the master pool to transfer pool tokens, which we have received from the completion of the
        // pending withdrawal, on behalf of the network
        completedRequest.poolToken.approve(address(cachedMasterPool), completedRequest.poolTokenAmount);

        // transfer governance tokens from the caller to the master pool
        _govToken.transferFrom(provider, address(cachedMasterPool), completedRequest.poolTokenAmount);

        // call withdraw on the master pool
        cachedMasterPool.withdraw(contextId, provider, completedRequest.poolTokenAmount);
    }

    /**
     * @dev handles base token withdrawal
     */
    function _withdrawBaseToken(
        bytes32 contextId,
        address provider,
        CompletedWithdrawal memory completedRequest
    ) private {
        ReserveToken pool = completedRequest.poolToken.reserveToken();

        // get the pool collection that manages this pool
        IPoolCollection poolCollection = _poolCollection(pool);

        // approve the pool collection to transfer pool tokens, which we have received from the completion of the
        // pending withdrawal, on behalf of the network
        completedRequest.poolToken.approve(address(poolCollection), completedRequest.poolTokenAmount);

        // call withdraw on the base token pool - returns the amounts/breakdown
        poolCollection.withdraw(contextId, provider, pool, completedRequest.poolTokenAmount);
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
        uint32 currentTime = _time();
        if (deadline < currentTime) {
            revert DeadlineExpired();
        }

        // ensure the beneficiary is set
        if (beneficiary == address(0)) {
            beneficiary = trader;
        }

        bytes32 contextId = keccak256(
            abi.encodePacked(
                trader,
                currentTime,
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
        if (_isNetworkToken(sourceToken)) {
            tradeAmount = _tradeNetworkToken(contextId, targetToken, true, sourceAmount, minReturnAmount, trader);
        } else if (_isNetworkToken(targetToken)) {
            tradeAmount = _tradeNetworkToken(contextId, sourceToken, false, sourceAmount, minReturnAmount, trader);
        } else {
            tradeAmount = _tradeBaseTokens(contextId, sourceToken, targetToken, sourceAmount, minReturnAmount, trader);
        }

        // transfer the tokens from the trader to the vault
        _depositToMasterVault(sourceToken, trader, sourceAmount);

        // transfer the target tokens/ETH to the beneficiary
        _masterVault.withdrawFunds(targetToken, payable(beneficiary), tradeAmount);
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
        ReserveToken masterPool = ReserveToken.wrap(address(_networkToken));
        (ReserveToken sourceToken, ReserveToken targetToken) = isSourceNetworkToken
            ? (masterPool, pool)
            : (pool, masterPool);
        TradeAmountsWithLiquidity memory tradeAmounts = _poolCollection(pool).trade(
            contextId,
            sourceToken,
            targetToken,
            sourceAmount,
            minReturnAmount
        );

        IMasterPool cachedMasterPool = _masterPool;

        // if the target token is the network token, notify the master pool on collected fees
        if (!isSourceNetworkToken) {
            cachedMasterPool.onFeesCollected(pool, tradeAmounts.feeAmount, TRADING_FEE);
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
            amount: tradeAmounts.feeAmount
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
     * @dev deposits reserve tokens to the master vault and verifies that msg.value corresponds to its type
     */
    function _depositToMasterVault(
        ReserveToken reserveToken,
        address caller,
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
            payable(address(_masterVault)).sendValue(amount);
        } else {
            if (reserveToken.isNativeToken()) {
                revert InvalidPool();
            }

            reserveToken.safeTransferFrom(caller, address(_masterVault), amount);
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

    /**
     * @dev returns whether the specified token is the network token
     */
    function _isNetworkToken(ReserveToken token) private view returns (bool) {
        return token.toIERC20() == _networkToken;
    }

    /**
     * @dev initiates liquidity withdrawal
     */
    function _initWithdrawal(
        address provider,
        IPoolToken poolToken,
        uint256 poolTokenAmount
    ) private returns (uint256) {
        // transfer the pool tokens from the provider. Note, that the provider should have either previously approved
        // the pool token amount or provided a EIP712 typed signature for an EIP2612 permit request
        poolToken.safeTransferFrom(provider, address(_pendingWithdrawals), poolTokenAmount);

        return _pendingWithdrawals.initWithdrawal(provider, poolToken, poolTokenAmount);
    }

    /**
     * @dev grants/revokes required roles to/from a pool collection
     */
    function _setAccessRoles(IPoolCollection poolCollection, bool set) private {
        address poolCollectionAddress = address(poolCollection);

        if (set) {
            _masterPool.grantRole(ROLE_NETWORK_TOKEN_MANAGER, poolCollectionAddress);
            _masterPool.grantRole(ROLE_VAULT_MANAGER, poolCollectionAddress);
            _masterPool.grantRole(ROLE_FUNDING_MANAGER, poolCollectionAddress);
            _masterVault.grantRole(ROLE_ASSET_MANAGER, poolCollectionAddress);
            _externalProtectionVault.grantRole(ROLE_ASSET_MANAGER, poolCollectionAddress);
        } else {
            _masterPool.revokeRole(ROLE_NETWORK_TOKEN_MANAGER, poolCollectionAddress);
            _masterPool.revokeRole(ROLE_VAULT_MANAGER, poolCollectionAddress);
            _masterPool.revokeRole(ROLE_FUNDING_MANAGER, poolCollectionAddress);
            _masterVault.revokeRole(ROLE_ASSET_MANAGER, poolCollectionAddress);
            _externalProtectionVault.revokeRole(ROLE_ASSET_MANAGER, poolCollectionAddress);
        }
    }
}

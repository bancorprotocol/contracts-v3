// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/drafts/IERC20Permit.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import { ITokenGovernance } from "@bancor/token-governance/0.7.6/contracts/TokenGovernance.sol";

import { ITokenHolder } from "../utility/interfaces/ITokenHolder.sol";
import { OwnedUpgradeable } from "../utility/OwnedUpgradeable.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Time } from "../utility/Time.sol";
import { Utils } from "../utility/Utils.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";
import { ReserveToken } from "../token/ReserveToken.sol";

import { IPoolCollection, PoolLiquidity, DepositAmounts as PoolCollectionDepositAmounts, WithdrawalAmounts as PoolCollectionWithdrawalAmounts } from "../pools/interfaces/IPoolCollection.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { INetworkTokenPool, DepositAmounts as NetworkTokenPoolDepositAmounts, WithdrawalAmounts as NetworkTokenPoolWithdrawalAmounts } from "../pools/interfaces/INetworkTokenPool.sol";

import { INetworkSettings } from "./interfaces/INetworkSettings.sol";
import { IPendingWithdrawals, WithdrawalRequest, CompletedWithdrawal } from "./interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { IBancorVault } from "./interfaces/IBancorVault.sol";

/**
 * @dev Bancor Network contract
 */
contract BancorNetwork is IBancorNetwork, Upgradeable, OwnedUpgradeable, ReentrancyGuardUpgradeable, Time, Utils {
    using Address for address payable;
    using SafeMath for uint256;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using ReserveToken for IReserveToken;

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

    // the address of the external protection wallet
    ITokenHolder private _externalProtectionWallet;

    // the set of all valid pool collections
    EnumerableSetUpgradeable.AddressSet private _poolCollections;

    // a mapping between the last pool collection that was added to the pool collections set and its type
    mapping(uint16 => IPoolCollection) private _latestPoolCollections;

    // the set of all pools
    EnumerableSetUpgradeable.AddressSet private _liquidityPools;

    // a mapping between pools and their respective pool collections
    mapping(IReserveToken => IPoolCollection) private _collectionByPool;

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
    event PoolAdded(uint16 indexed poolType, IReserveToken indexed pool, IPoolCollection indexed poolCollection);

    /**
     * @dev triggered when an existing pool is upgraded
     */
    event PoolUpgraded(
        uint16 indexed poolType,
        IReserveToken indexed pool,
        IPoolCollection prevPoolCollection,
        IPoolCollection newPoolCollection,
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
        IPoolCollection poolCollection,
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
        IPoolCollection poolCollection,
        uint256 poolTokenAmount,
        uint256 govTokenAmount,
        uint256 baseTokenAmount,
        uint256 externalProtectionBaseTokenAmount,
        uint256 networkTokenAmount,
        uint256 withdrawalFeeAmount
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
    function initialize(INetworkTokenPool initNetworkTokenPool, IPendingWithdrawals initPendingWithdrawals)
        external
        validAddress(address(initNetworkTokenPool))
        validAddress(address(initPendingWithdrawals))
        initializer
    {
        __BancorNetwork_init(initNetworkTokenPool, initPendingWithdrawals);
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorNetwork_init(INetworkTokenPool initNetworkTokenPool, IPendingWithdrawals initPendingWithdrawals)
        internal
        initializer
    {
        __Owned_init();
        __ReentrancyGuard_init();

        __BancorNetwork_init_unchained(initNetworkTokenPool, initPendingWithdrawals);
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorNetwork_init_unchained(
        INetworkTokenPool initNetworkTokenPool,
        IPendingWithdrawals initPendingWithdrawals
    ) internal initializer {
        _networkTokenPool = initNetworkTokenPool;
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
    function networkTokenGovernance() external view override returns (ITokenGovernance) {
        return _networkTokenGovernance;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function govToken() external view override returns (IERC20) {
        return _govToken;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function govTokenGovernance() external view override returns (ITokenGovernance) {
        return _govTokenGovernance;
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
    function vault() external view override returns (IBancorVault) {
        return _vault;
    }

    /**
     * @dev IBancorNetwork
     */
    function networkPoolToken() external view override returns (IPoolToken) {
        return _networkPoolToken;
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function networkTokenPool() external view override returns (INetworkTokenPool) {
        return _networkTokenPool;
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
    function addPoolCollection(IPoolCollection poolCollection)
        external
        validAddress(address(poolCollection))
        nonReentrant
        onlyOwner
    {
        require(_poolCollections.add(address(poolCollection)), "ERR_COLLECTION_ALREADY_EXISTS");

        uint16 poolType = poolCollection.poolType();
        _setLatestPoolCollection(poolType, poolCollection);

        emit PoolCollectionAdded({ poolType: poolType, poolCollection: poolCollection });
    }

    /**
     * @dev removes an existing pool collection from the pool
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function removePoolCollection(IPoolCollection poolCollection, IPoolCollection newLatestPoolCollection)
        external
        validAddress(address(poolCollection))
        onlyOwner
        nonReentrant
    {
        // verify that a pool collection is a valid latest pool collection (e.g., it either exists or a reset to zero)
        _verifyLatestPoolCollectionCandidate(newLatestPoolCollection);

        // verify that no pools are associated with the specified pool collection
        require(poolCollection.poolCount() == 0, "ERR_COLLECTION_IS_NOT_EMPTY");

        require(_poolCollections.remove(address(poolCollection)), "ERR_COLLECTION_DOES_NOT_EXIST");

        uint16 poolType = poolCollection.poolType();
        if (address(newLatestPoolCollection) != address(0)) {
            uint16 newLatestPoolCollectionType = newLatestPoolCollection.poolType();
            require(poolType == newLatestPoolCollectionType, "ERR_WRONG_COLLECTION_TYPE");
        }

        _setLatestPoolCollection(poolType, newLatestPoolCollection);

        emit PoolCollectionRemoved({ poolType: poolType, poolCollection: poolCollection });
    }

    /**
     * @dev sets the new latest pool collection for the given type
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setLatestPoolCollection(IPoolCollection poolCollection)
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
    function poolCollections() external view override returns (IPoolCollection[] memory) {
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
    function latestPoolCollection(uint16 poolType) external view override returns (IPoolCollection) {
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
    function collectionByPool(IReserveToken pool) external view override returns (IPoolCollection) {
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
        require(reserveToken != IReserveToken(address(_networkToken)), "ERR_UNSUPPORTED_TOKEN");
        require(_liquidityPools.add(address(reserveToken)), "ERR_POOL_ALREADY_EXISTS");

        // get the latest pool collection, corresponding to the requested type of the new pool, and use it to create the
        // pool
        IPoolCollection poolCollection = _latestPoolCollections[poolType];
        require(address(poolCollection) != address(0), "ERR_UNSUPPORTED_TYPE");

        // this is where the magic happens...
        poolCollection.createPool(reserveToken);

        // add the pool to the reverse pool collection lookup
        _collectionByPool[reserveToken] = poolCollection;

        emit PoolAdded({ poolType: poolType, pool: reserveToken, poolCollection: poolCollection });
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function depositFor(
        address provider,
        IReserveToken pool,
        uint256 tokenAmount
    )
        external
        payable
        override
        validAddress(provider)
        validAddress(address(pool))
        greaterThanZero(tokenAmount)
        nonReentrant
    {
        _depositFor(provider, pool, tokenAmount, msg.sender);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function deposit(IReserveToken pool, uint256 tokenAmount)
        external
        payable
        override
        validAddress(address(pool))
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
        IReserveToken pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override validAddress(provider) validAddress(address(pool)) greaterThanZero(tokenAmount) nonReentrant {
        _depositBaseTokenForPermitted(provider, pool, tokenAmount, msg.sender, deadline, v, r, s);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function depositPermitted(
        IReserveToken pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override validAddress(address(pool)) greaterThanZero(tokenAmount) nonReentrant {
        _depositBaseTokenForPermitted(msg.sender, pool, tokenAmount, msg.sender, deadline, v, r, s);
    }

    /**
     * @inheritdoc IBancorNetwork
     */
    function withdraw(uint256 id) external override nonReentrant {
        address provider = msg.sender;
        bytes32 contextId = _withdrawContextId(provider, id);

        // complete the withdrawal and claim the locked pool tokens
        CompletedWithdrawal memory completedRequest = _pendingWithdrawals.completeWithdrawal(contextId, provider, id);

        if (completedRequest.poolToken == _networkPoolToken) {
            _withdrawNetworkToken(contextId, provider, completedRequest);
        } else {
            _withdrawBaseToken(contextId, provider, completedRequest);
        }
    }

    /**
     * @dev sets the new latest pool collection for the given type
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
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
        require(
            address(poolCollection) == address(0) || _poolCollections.contains(address(poolCollection)),
            "ERR_COLLECTION_DOES_NOT_EXIST"
        );
    }

    /**
     * @dev generates context ID for a deposit requesst
     */
    function _depositContextId(
        address provider,
        IReserveToken pool,
        uint256 tokenAmount,
        address sender
    ) private view returns (bytes32) {
        return keccak256(abi.encodePacked(provider, _time(), pool, tokenAmount, sender));
    }

    /**
     * @dev generates context ID for a withdraw request
     */
    function _withdrawContextId(address provider, uint256 id) private view returns (bytes32) {
        return keccak256(abi.encodePacked(provider, _time(), id));
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
        IReserveToken pool,
        uint256 tokenAmount,
        address sender
    ) private {
        bytes32 contextId = _depositContextId(provider, pool, tokenAmount, sender);

        if (pool == IReserveToken(address(_networkToken))) {
            _depositNetworkTokenFor(contextId, provider, tokenAmount, sender);
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
        address sender
    ) private {
        INetworkTokenPool cachedNetworkTokenPool = _networkTokenPool;

        // transfer the tokens from the sender to the network token pool
        _networkToken.transferFrom(sender, address(cachedNetworkTokenPool), networkTokenAmount);

        // process network token pool deposit
        NetworkTokenPoolDepositAmounts memory depositAmounts = cachedNetworkTokenPool.depositFor(
            provider,
            networkTokenAmount,
            false,
            0
        );

        emit FundsDeposited({
            contextId: contextId,
            token: IReserveToken(address(_networkToken)),
            provider: provider,
            poolCollection: IPoolCollection(address(0x0)),
            depositAmount: networkTokenAmount,
            poolTokenAmount: depositAmounts.poolTokenAmount
        });

        emit TotalLiquidityUpdated({
            contextId: contextId,
            pool: IReserveToken(address(_networkToken)),
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
        IReserveToken pool,
        uint256 baseTokenAmount,
        address sender
    ) private {
        INetworkTokenPool cachedNetworkTokenPool = _networkTokenPool;

        // get the pool collection that managed this pool
        IPoolCollection poolCollection = _poolCollection(pool);

        // if there is no available network token liquidity - it's enough to check that the pool is whitelisted. Otherwise,
        // we need to check if the network token pool is able to provide network liquidity
        uint256 availableNetworkTokenLiquidity = cachedNetworkTokenPool.availableMintingAmount(pool);
        if (availableNetworkTokenLiquidity == 0) {
            require(_settings.isTokenWhitelisted(pool), "ERR_POOL_NOT_WHITELISTED");
        } else {
            require(
                cachedNetworkTokenPool.isNetworkLiquidityEnabled(pool, poolCollection),
                "ERR_NETWORK_LIQUIDITY_DISABLED"
            );
        }

        // transfer the tokens from the sender to the vault
        if (msg.value > 0) {
            require(pool.isNativeToken(), "ERR_INVALID_POOL");

            require(msg.value == baseTokenAmount, "ERR_ETH_AMOUNT_MISMATCH");

            // using a regular transfer here would revert due to exceeding the 2,300 gas limit which is why we're using
            // call instead (via sendValue), which the 2,300 gas limit does not apply for
            payable(_vault).sendValue(baseTokenAmount);
        } else {
            require(!pool.isNativeToken(), "ERR_INVALID_POOL");

            pool.safeTransferFrom(sender, address(_vault), baseTokenAmount);
        }

        // process deposit to the base token pool (taking into account the ETH pool)
        PoolCollectionDepositAmounts memory depositAmounts = poolCollection.depositFor(
            provider,
            pool,
            baseTokenAmount,
            availableNetworkTokenLiquidity
        );

        // request additional liquidity from the network token pool and transfer it to the vault
        if (depositAmounts.networkTokenDeltaAmount > 0) {
            cachedNetworkTokenPool.requestLiquidity(contextId, pool, depositAmounts.networkTokenDeltaAmount);
        }

        // TODO: process network fees based on the return values

        emit FundsDeposited({
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
            pool: IReserveToken(address(_networkToken)),
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
            reserveToken: IReserveToken(address(_networkToken)),
            liquidity: poolLiquidity.networkTokenTradingLiquidity
        });
    }

    function _depositBaseTokenForPermitted(
        address provider,
        IReserveToken pool,
        uint256 tokenAmount,
        address sender,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        // unfortunately, neither the network token or ETH support EIP2612 permit requests
        require(pool != IReserveToken(address(_networkToken)) && !pool.isNativeToken(), "ERR_PERMIT_UNSUPPORTED");

        // permit the amount the caller is trying to deposit. Please note, that if the base token doesn't support
        // EIP2612 permit - either this call of the inner safeTransferFrom will revert
        IERC20Permit(address(pool)).permit(sender, address(this), tokenAmount, deadline, v, r, s);

        bytes32 contextId = _depositContextId(provider, pool, tokenAmount, sender);

        _depositBaseTokenFor(contextId, provider, pool, tokenAmount, sender);
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

        emit FundsWithdrawn({
            contextId: contextId,
            token: IReserveToken(address(_networkToken)),
            provider: provider,
            poolCollection: IPoolCollection(address(0x0)),
            poolTokenAmount: amounts.poolTokenAmount,
            govTokenAmount: amounts.govTokenAmount,
            baseTokenAmount: 0,
            externalProtectionBaseTokenAmount: 0,
            networkTokenAmount: amounts.networkTokenAmount,
            withdrawalFeeAmount: amounts.withdrawalFeeAmount
        });

        emit TotalLiquidityUpdated({
            contextId: contextId,
            pool: IReserveToken(address(_networkToken)),
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

        IReserveToken pool = completedRequest.poolToken.reserveToken();

        // get the pool collection that manages this pool
        IPoolCollection poolCollection = _poolCollection(pool);

        // ensure that network token liquidity is enabled
        require(
            cachedNetworkTokenPool.isNetworkLiquidityEnabled(pool, poolCollection),
            "ERR_NETWORK_LIQUIDITY_DISABLED"
        );

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

        emit FundsWithdrawn({
            contextId: contextId,
            token: pool,
            provider: provider,
            poolCollection: poolCollection,
            poolTokenAmount: completedRequest.poolTokenAmount,
            govTokenAmount: 0,
            baseTokenAmount: amounts.baseTokenAmountToTransferFromVaultToProvider.add(
                amounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider
            ),
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
            reserveToken: IReserveToken(address(_networkToken)),
            liquidity: poolLiquidity.networkTokenTradingLiquidity
        });
    }

    /**
     * @dev verifies that the specified pool is managed by a valid pool collection and returns it
     */
    function _poolCollection(IReserveToken pool) private view returns (IPoolCollection) {
        // verify that the pool is managed by a valid pool collection
        IPoolCollection poolCollection = _collectionByPool[pool];
        _validAddress(address(poolCollection));

        return poolCollection;
    }
}

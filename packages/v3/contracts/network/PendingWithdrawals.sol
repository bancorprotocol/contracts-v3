// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

import { OwnedUpgradeable } from "../utility/OwnedUpgradeable.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { INetworkTokenPool } from "../pools/interfaces/INetworkTokenPool.sol";

import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { IPendingWithdrawals } from "./interfaces/IPendingWithdrawals.sol";

/**
 * @dev Pending Withdrawals contract
 */
contract PendingWithdrawals is
    IPendingWithdrawals,
    Upgradeable,
    OwnedUpgradeable,
    ReentrancyGuardUpgradeable,
    Time,
    Utils
{
    using SafeMath for uint256;
    using SafeERC20 for IPoolToken;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    uint16 private constant WITHDRAWAL_REQUEST_DATA_VERSION = 1;
    uint256 private constant DEFAULT_LOCK_DURATION = 7 days;
    uint256 private constant DEFAULT_WITHDRAWAL_WINDOW_DURATION = 3 days;

    // the network token contract
    IERC20 private immutable _networkToken;

    // the network contract
    IBancorNetwork private immutable _network;

    // the network token pool contract
    INetworkTokenPool private immutable _networkTokenPool;

    // the lock duration
    uint256 private _lockDuration;

    // the withdrawal window duration
    uint256 private _withdrawalWindowDuration;

    // a mapping between accounts and their pending withdrawal requests
    uint256 private _nextWithdrawalRequestId;
    mapping(address => EnumerableSetUpgradeable.UintSet) private _withdrawalRequestIdsByProvider;
    mapping(uint256 => WithdrawalRequest) private _withdrawalRequests;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 5] private __gap;

    /**
     * @dev triggered when the lock duration is updated
     */
    event LockDurationUpdated(uint256 prevLockDuration, uint256 newLockDuration);

    /**
     * @dev triggered when withdrawal window duration
     */
    event WithdrawalWindowDurationUpdated(uint256 prevWithdrawalWindowDuration, uint256 newWithdrawalWindowDuration);

    /**
     * @dev triggered when a provider requests to initiate a liquidity withdrawal
     */
    event WithdrawalInitiated(
        IReserveToken indexed pool,
        address indexed provider,
        uint256 indexed requestId,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when a provider cancels a liquidity withdrawal request
     */
    event WithdrawalCancelled(
        IReserveToken indexed pool,
        address indexed provider,
        uint256 indexed requestId,
        uint256 poolTokenAmount,
        uint32 timeElapsed
    );

    /**
     * @dev triggered when a provider requests to reinitiate a liquidity withdrawal
     */
    event WithdrawalReinitiated(
        IReserveToken indexed pool,
        address indexed provider,
        uint256 indexed requestId,
        uint256 poolTokenAmount,
        uint32 timeElapsed
    );

    /**
     * @dev triggered when a liquidity withdrawal request has been completed
     */
    event WithdrawalCompleted(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        address indexed provider,
        uint256 requestId,
        uint256 poolTokenAmount,
        uint32 timeElapsed
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IBancorNetwork initNetwork, INetworkTokenPool initNetworkTokenPool)
        validAddress(address(initNetwork))
        validAddress(address(initNetworkTokenPool))
    {
        _networkToken = initNetwork.networkToken();
        _network = initNetwork;
        _networkTokenPool = initNetworkTokenPool;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __PendingWithdrawals_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __PendingWithdrawals_init() internal initializer {
        __ReentrancyGuard_init();
        __Owned_init();

        __PendingWithdrawals_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __PendingWithdrawals_init_unchained() internal initializer {
        _lockDuration = DEFAULT_LOCK_DURATION;
        _withdrawalWindowDuration = DEFAULT_WITHDRAWAL_WINDOW_DURATION;
    }

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function network() external view override returns (IBancorNetwork) {
        return _network;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function networkTokenPool() external view override returns (INetworkTokenPool) {
        return _networkTokenPool;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function lockDuration() external view override returns (uint256) {
        return _lockDuration;
    }

    /**
     * @dev sets the lock duration.
     *
     * notes:
     *
     * - updating it will affect existing locked positions retroactively
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setLockDuration(uint256 newLockDuration) external onlyOwner {
        emit LockDurationUpdated(_lockDuration, newLockDuration);

        _lockDuration = newLockDuration;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function withdrawalWindowDuration() external view override returns (uint256) {
        return _withdrawalWindowDuration;
    }

    /**
     * @dev sets withdrawal window duration.
     *
     * notes:
     *
     * - updating it will affect existing locked positions retroactively
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setWithdrawalWindowDuration(uint256 newWithdrawalWindowDuration) external onlyOwner {
        emit WithdrawalWindowDurationUpdated(_withdrawalWindowDuration, newWithdrawalWindowDuration);

        _withdrawalWindowDuration = newWithdrawalWindowDuration;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function withdrawalRequestCount(address provider) external view override returns (uint256) {
        return _withdrawalRequestIdsByProvider[provider].length();
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function withdrawalRequestIds(address provider) external view override returns (uint256[] memory) {
        EnumerableSetUpgradeable.UintSet storage providerRequests = _withdrawalRequestIdsByProvider[provider];
        uint256 length = providerRequests.length();
        uint256[] memory list = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            list[i] = providerRequests.at(i);
        }
        return list;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function withdrawalRequest(uint256 id) external view override returns (WithdrawalRequest memory) {
        return _withdrawalRequests[id];
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function initWithdrawal(IPoolToken poolToken, uint256 poolTokenAmount)
        external
        override
        validAddress(address(poolToken))
        greaterThanZero(poolTokenAmount)
        nonReentrant
    {
        _initWithdrawal(msg.sender, poolToken, poolTokenAmount);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function initWithdrawalDelegated(
        IPoolToken poolToken,
        uint256 poolTokenAmount,
        address provider,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override validAddress(address(poolToken)) greaterThanZero(poolTokenAmount) nonReentrant {
        poolToken.permit(provider, address(this), poolTokenAmount, deadline, v, r, s);

        _initWithdrawal(provider, poolToken, poolTokenAmount);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function cancelWithdrawal(uint256 id) external override nonReentrant {
        WithdrawalRequest memory request = _withdrawalRequests[id];
        address provider = request.provider;
        require(provider == msg.sender, "ERR_ACCESS_DENIED");

        _cancelWithdrawal(request, id);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function reinitWithdrawal(uint256 id) external override nonReentrant {
        WithdrawalRequest storage request = _withdrawalRequests[id];
        address provider = request.provider;
        require(provider == msg.sender, "ERR_ACCESS_DENIED");

        uint256 currentTime = _time();

        emit WithdrawalReinitiated(
            request.poolToken.reserveToken(),
            provider,
            id,
            request.amount,
            uint32(currentTime.sub(request.createdAt))
        );

        request.createdAt = currentTime;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function completeWithdrawal(
        bytes32 contextId,
        address provider,
        uint256 id
    ) external override returns (uint256) {
        WithdrawalRequest memory request = _withdrawalRequests[id];
        require(provider == request.provider, "ERR_ACCESS_DENIED");

        // verify the caller:
        // - in order to complete a network token withdrawal, the caller must be the network token pool
        // - in order to complete a base token withdrawal, the caller must be the pool collection that manages the pool
        IReserveToken reserveToken = request.poolToken.reserveToken();
        if (address(reserveToken) == address(_networkToken)) {
            require(msg.sender == address(_networkTokenPool), "ERR_ACCESS_DENIED");
        } else {
            require(msg.sender == address(_network.collectionByPool(reserveToken)), "ERR_ACCESS_DENIED");
        }

        // verify that the current time is older than the lock duration but not older than the lock duration + withdrawal window duration
        uint256 currentTime = _time();
        uint256 withdrawalStartTime = request.createdAt.add(_lockDuration);
        uint256 withdrawalEndTime = withdrawalStartTime.add(_withdrawalWindowDuration);
        require(currentTime >= withdrawalStartTime && currentTime <= withdrawalEndTime, "ERR_WITHDRAWAL_NOT_ALLOWED");

        // remove the withdrawal request and its id from the storage
        _removeWithdrawalRequest(request, id);

        // transfer the locked pool tokens back to the caller
        request.poolToken.safeTransfer(msg.sender, request.amount);

        emit WithdrawalCompleted(
            contextId,
            reserveToken,
            provider,
            id,
            request.amount,
            uint32(currentTime.sub(request.createdAt))
        );

        return request.amount;
    }

    /**
     * @dev initiates liquidity withdrawal
     */
    function _initWithdrawal(
        address provider,
        IPoolToken poolToken,
        uint256 poolTokenAmount
    ) private {
        // make sure that the pool is valid
        IReserveToken pool = poolToken.reserveToken();
        require(_network.isPoolValid(pool), "ERR_INVALID_POOL");

        // record the current withdrawal request alongside previous pending withdrawal requests
        uint256 id = _nextWithdrawalRequestId++;

        _withdrawalRequests[id] = WithdrawalRequest({
            version: WITHDRAWAL_REQUEST_DATA_VERSION,
            provider: provider,
            poolToken: poolToken,
            amount: poolTokenAmount,
            createdAt: _time()
        });

        require(_withdrawalRequestIdsByProvider[provider].add(id), "ERR_WITHDRAWAL_ALREADY_EXISTS");

        // transfer the pool tokens from the provider. Note, that the provider should have either previously
        // approved the pool token amount or provided a EIP712 typed signture for an EIP2612 permit request
        poolToken.safeTransferFrom(provider, address(this), poolTokenAmount);

        emit WithdrawalInitiated(pool, provider, id, poolTokenAmount);
    }

    /**
     * @dev cancels a withdrawal request
     */
    function _cancelWithdrawal(WithdrawalRequest memory request, uint256 id) private {
        // remove the withdrawal request and its id from the storage
        _removeWithdrawalRequest(request, id);

        // transfer the locked pool tokens back to the provider
        request.poolToken.safeTransfer(request.provider, request.amount);

        emit WithdrawalCancelled(
            request.poolToken.reserveToken(),
            request.provider,
            id,
            request.amount,
            uint32(_time().sub(request.createdAt))
        );
    }

    /**
     * @dev removes withdrawal request
     */
    function _removeWithdrawalRequest(WithdrawalRequest memory request, uint256 id) private {
        delete _withdrawalRequests[id];

        require(_withdrawalRequestIdsByProvider[request.provider].remove(id), "ERR_WITHDRAWAL_DOES_NOT_EXIST");
    }
}

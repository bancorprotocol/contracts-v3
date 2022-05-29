// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AccessDenied, AlreadyExists, DoesNotExist } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";
import { MathEx } from "../utility/MathEx.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { IPendingWithdrawals, WithdrawalRequest, CompletedWithdrawal } from "./interfaces/IPendingWithdrawals.sol";

/**
 * @dev Pending Withdrawals contract
 */
contract PendingWithdrawals is IPendingWithdrawals, Upgradeable, Time, Utils {
    using SafeERC20 for IPoolToken;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using TokenLibrary for Token;

    error WithdrawalNotAllowed();

    uint32 private constant DEFAULT_LOCK_DURATION = 7 days;

    // the network contract
    IBancorNetwork private immutable _network;

    // the BNT contract
    IERC20 private immutable _bnt;

    // the BNT pool contract
    IBNTPool private immutable _bntPool;

    // the lock duration
    uint32 private _lockDuration;

    // a mapping between accounts and their pending withdrawal requests
    uint256 private _nextWithdrawalRequestId;
    mapping(address => EnumerableSetUpgradeable.UintSet) private _withdrawalRequestIdsByProvider;
    mapping(uint256 => WithdrawalRequest) private _withdrawalRequests;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 4] private __gap;

    /**
     * @dev triggered when the lock duration is updated
     */
    event LockDurationUpdated(uint32 prevLockDuration, uint32 newLockDuration);

    /**
     * @dev triggered when a provider requests to initiate a liquidity withdrawal
     */
    event WithdrawalInitiated(
        Token indexed pool,
        address indexed provider,
        uint256 indexed requestId,
        uint256 poolTokenAmount,
        uint256 reserveTokenAmount
    );

    /**
     * @dev triggered when a provider cancels a liquidity withdrawal request
     */
    event WithdrawalCancelled(
        Token indexed pool,
        address indexed provider,
        uint256 indexed requestId,
        uint256 poolTokenAmount,
        uint256 reserveTokenAmount,
        uint32 timeElapsed
    );

    /**
     * @dev triggered when a liquidity withdrawal request has been completed
     */
    event WithdrawalCompleted(
        bytes32 indexed contextId,
        Token indexed pool,
        address indexed provider,
        uint256 requestId,
        uint256 poolTokenAmount,
        uint256 reserveTokenAmount,
        uint32 timeElapsed
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        IERC20 initBNT,
        IBNTPool initBNTPool
    ) validAddress(address(initNetwork)) validAddress(address(initBNT)) validAddress(address(initBNTPool)) {
        _network = initNetwork;
        _bnt = initBNT;
        _bntPool = initBNTPool;
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
    function __PendingWithdrawals_init() internal onlyInitializing {
        __Upgradeable_init();

        __PendingWithdrawals_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __PendingWithdrawals_init_unchained() internal onlyInitializing {
        _setLockDuration(DEFAULT_LOCK_DURATION);
    }

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 4;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function lockDuration() external view returns (uint32) {
        return _lockDuration;
    }

    /**
     * @dev sets the lock duration
     *
     * notes:
     *
     * - updating it will affect existing locked positions retroactively
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setLockDuration(uint32 newLockDuration) external onlyAdmin {
        _setLockDuration(newLockDuration);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function withdrawalRequestCount(address provider) external view returns (uint256) {
        return _withdrawalRequestIdsByProvider[provider].length();
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function withdrawalRequestIds(address provider) external view returns (uint256[] memory) {
        return _withdrawalRequestIdsByProvider[provider].values();
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function withdrawalRequest(uint256 id) external view returns (WithdrawalRequest memory) {
        return _withdrawalRequests[id];
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function initWithdrawal(
        address provider,
        IPoolToken poolToken,
        uint256 poolTokenAmount
    )
        external
        validAddress(address(poolToken))
        greaterThanZero(poolTokenAmount)
        only(address(_network))
        returns (uint256)
    {
        return _initWithdrawal(provider, poolToken, poolTokenAmount);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function cancelWithdrawal(address provider, uint256 id) external only(address(_network)) returns (uint256) {
        WithdrawalRequest memory request = _withdrawalRequests[id];

        if (request.provider != provider) {
            revert AccessDenied();
        }

        return _cancelWithdrawal(request, id);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function completeWithdrawal(
        bytes32 contextId,
        address provider,
        uint256 id
    ) external only(address(_network)) returns (CompletedWithdrawal memory) {
        WithdrawalRequest memory request = _withdrawalRequests[id];

        if (provider != request.provider) {
            revert AccessDenied();
        }

        uint32 currentTime = _time();
        if (!_canWithdrawAt(currentTime, request.createdAt)) {
            revert WithdrawalNotAllowed();
        }

        // remove the withdrawal request and its id from the storage
        _removeWithdrawalRequest(provider, id);

        // approve the caller to transfer the locked pool tokens
        request.poolToken.approve(msg.sender, request.poolTokenAmount);

        emit WithdrawalCompleted({
            contextId: contextId,
            pool: request.reserveToken,
            provider: provider,
            requestId: id,
            poolTokenAmount: request.poolTokenAmount,
            reserveTokenAmount: request.reserveTokenAmount,
            timeElapsed: currentTime - request.createdAt
        });

        return
            CompletedWithdrawal({
                poolToken: request.poolToken,
                poolTokenAmount: request.poolTokenAmount,
                reserveTokenAmount: request.reserveTokenAmount
            });
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function isReadyForWithdrawal(uint256 id) external view returns (bool) {
        WithdrawalRequest storage request = _withdrawalRequests[id];

        return request.provider != address(0) && _canWithdrawAt(_time(), request.createdAt);
    }

    /**
     * @dev sets the lock duration
     *
     * notes:
     *
     * - updating it will affect existing locked positions retroactively
     *
     */
    function _setLockDuration(uint32 newLockDuration) private {
        uint32 prevLockDuration = _lockDuration;
        if (prevLockDuration == newLockDuration) {
            return;
        }

        _lockDuration = newLockDuration;

        emit LockDurationUpdated({ prevLockDuration: prevLockDuration, newLockDuration: newLockDuration });
    }

    /**
     * @dev initiates liquidity withdrawal
     */
    function _initWithdrawal(
        address provider,
        IPoolToken poolToken,
        uint256 poolTokenAmount
    ) private returns (uint256) {
        // record the current withdrawal request alongside previous pending withdrawal requests
        uint256 id = _nextWithdrawalRequestId++;

        // get the pool token value in reserve/pool tokens
        Token pool = poolToken.reserveToken();
        uint256 reserveTokenAmount = _poolTokenToUnderlying(pool, poolTokenAmount);
        _withdrawalRequests[id] = WithdrawalRequest({
            provider: provider,
            poolToken: poolToken,
            reserveToken: pool,
            poolTokenAmount: poolTokenAmount,
            reserveTokenAmount: reserveTokenAmount,
            createdAt: _time()
        });

        if (!_withdrawalRequestIdsByProvider[provider].add(id)) {
            revert AlreadyExists();
        }

        emit WithdrawalInitiated({
            pool: pool,
            provider: provider,
            requestId: id,
            poolTokenAmount: poolTokenAmount,
            reserveTokenAmount: reserveTokenAmount
        });

        return id;
    }

    /**
     * @dev returns the pool token value in tokens
     */
    function _poolTokenToUnderlying(Token pool, uint256 poolTokenAmount) private view returns (uint256) {
        if (pool.isEqual(_bnt)) {
            return _bntPool.poolTokenToUnderlying(poolTokenAmount);
        }

        return _network.collectionByPool(pool).poolTokenToUnderlying(pool, poolTokenAmount);
    }

    /**
     * @dev cancels a withdrawal request
     */
    function _cancelWithdrawal(WithdrawalRequest memory request, uint256 id) private returns (uint256) {
        // remove the withdrawal request and its id from the storage
        _removeWithdrawalRequest(request.provider, id);

        // transfer the locked pool tokens back to the provider
        request.poolToken.safeTransfer(request.provider, request.poolTokenAmount);

        emit WithdrawalCancelled({
            pool: request.reserveToken,
            provider: request.provider,
            requestId: id,
            poolTokenAmount: request.poolTokenAmount,
            reserveTokenAmount: request.reserveTokenAmount,
            timeElapsed: _time() - request.createdAt
        });

        return request.poolTokenAmount;
    }

    /**
     * @dev removes withdrawal request
     */
    function _removeWithdrawalRequest(address provider, uint256 id) private {
        if (!_withdrawalRequestIdsByProvider[provider].remove(id)) {
            revert DoesNotExist();
        }

        delete _withdrawalRequests[id];
    }

    /**
     * @dev returns whether it's possible to withdraw a request at the provided time
     */
    function _canWithdrawAt(uint32 time, uint32 createdAt) private view returns (bool) {
        return createdAt + _lockDuration <= time;
    }
}

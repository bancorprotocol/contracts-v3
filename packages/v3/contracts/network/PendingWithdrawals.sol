// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AccessControl, AlreadyExists, DoesNotExist, InvalidPool } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";
import { uncheckedInc } from "../utility/MathEx.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";

import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { IPendingWithdrawals, WithdrawalRequest, CompletedWithdrawal } from "./interfaces/IPendingWithdrawals.sol";

error WithdrawalNotAllowed();

/**
 * @dev Pending Withdrawals contract
 */
contract PendingWithdrawals is IPendingWithdrawals, Upgradeable, ReentrancyGuardUpgradeable, Time, Utils {
    using SafeERC20 for IPoolToken;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    uint32 private constant DEFAULT_LOCK_DURATION = 7 days;
    uint32 private constant DEFAULT_WITHDRAWAL_WINDOW_DURATION = 3 days;

    // the network token contract
    IERC20 private immutable _networkToken;

    // the network contract
    IBancorNetwork private immutable _network;

    // the lock duration
    uint32 private _lockDuration;

    // the withdrawal window duration
    uint32 private _withdrawalWindowDuration;

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
     * @dev triggered when withdrawal window duration
     */
    event WithdrawalWindowDurationUpdated(uint32 prevWithdrawalWindowDuration, uint32 newWithdrawalWindowDuration);

    /**
     * @dev triggered when a provider requests to initiate a liquidity withdrawal
     */
    event WithdrawalInitiated(
        ReserveToken indexed pool,
        address indexed provider,
        uint256 indexed requestId,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when a provider cancels a liquidity withdrawal request
     */
    event WithdrawalCancelled(
        ReserveToken indexed pool,
        address indexed provider,
        uint256 indexed requestId,
        uint256 poolTokenAmount,
        uint32 timeElapsed
    );

    /**
     * @dev triggered when a provider requests to reinitiate a liquidity withdrawal
     */
    event WithdrawalReinitiated(
        ReserveToken indexed pool,
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
        ReserveToken indexed pool,
        address indexed provider,
        uint256 requestId,
        uint256 poolTokenAmount,
        uint32 timeElapsed
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IBancorNetwork initNetwork) validAddress(address(initNetwork)) {
        _networkToken = initNetwork.networkToken();
        _network = initNetwork;
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
        __Upgradeable_init();
        __ReentrancyGuard_init();

        __PendingWithdrawals_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __PendingWithdrawals_init_unchained() internal initializer {
        _setLockDuration(DEFAULT_LOCK_DURATION);
        _setWithdrawalWindowDuration(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
    }

    // solhint-enable func-name-mixedcase
    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function network() external view returns (IBancorNetwork) {
        return _network;
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
    function setLockDuration(uint32 newLockDuration) external onlyRole(ROLE_ADMIN) {
        _setLockDuration(newLockDuration);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function withdrawalWindowDuration() external view returns (uint32) {
        return _withdrawalWindowDuration;
    }

    /**
     * @dev sets withdrawal window duration
     *
     * notes:
     *
     * - updating it will affect existing locked positions retroactively
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setWithdrawalWindowDuration(uint32 newWithdrawalWindowDuration) external onlyRole(ROLE_ADMIN) {
        _setWithdrawalWindowDuration(newWithdrawalWindowDuration);
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
        EnumerableSetUpgradeable.UintSet storage providerRequests = _withdrawalRequestIdsByProvider[provider];
        uint256 length = providerRequests.length();
        uint256[] memory list = new uint256[](length);
        for (uint256 i = 0; i < length; i = uncheckedInc(i)) {
            list[i] = providerRequests.at(i);
        }
        return list;
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
    function initWithdrawal(IPoolToken poolToken, uint256 poolTokenAmount)
        external
        validAddress(address(poolToken))
        greaterThanZero(poolTokenAmount)
        nonReentrant
    {
        _initWithdrawal(msg.sender, poolToken, poolTokenAmount);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function initWithdrawalPermitted(
        IPoolToken poolToken,
        uint256 poolTokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external validAddress(address(poolToken)) greaterThanZero(poolTokenAmount) nonReentrant {
        poolToken.permit(msg.sender, address(this), poolTokenAmount, deadline, v, r, s);

        _initWithdrawal(msg.sender, poolToken, poolTokenAmount);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function readyForWithdrawal(uint256 id) external view returns (bool) {
        WithdrawalRequest memory request = _withdrawalRequests[id];

        return request.provider != address(0) && _canWithdrawAt(_time(), request.createdAt);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function cancelWithdrawal(uint256 id) external nonReentrant {
        WithdrawalRequest memory request = _withdrawalRequests[id];
        address provider = request.provider;
        if (provider != msg.sender) {
            revert AccessControl();
        }

        _cancelWithdrawal(request, id);
    }

    /**
     * @inheritdoc IPendingWithdrawals
     */
    function reinitWithdrawal(uint256 id) external nonReentrant {
        WithdrawalRequest storage request = _withdrawalRequests[id];
        address provider = request.provider;
        if (provider != msg.sender) {
            revert AccessControl();
        }

        uint32 currentTime = _time();

        emit WithdrawalReinitiated({
            pool: request.poolToken.reserveToken(),
            provider: provider,
            requestId: id,
            poolTokenAmount: request.poolTokenAmount,
            timeElapsed: currentTime - request.createdAt
        });

        request.createdAt = currentTime;
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
            revert AccessControl();
        }

        uint32 currentTime = _time();
        if (!_canWithdrawAt(currentTime, request.createdAt)) {
            revert WithdrawalNotAllowed();
        }

        // remove the withdrawal request and its id from the storage
        _removeWithdrawalRequest(request, id);

        // transfer the locked pool tokens back to the caller
        request.poolToken.safeTransfer(msg.sender, request.poolTokenAmount);

        emit WithdrawalCompleted({
            contextId: contextId,
            pool: request.poolToken.reserveToken(),
            provider: provider,
            requestId: id,
            poolTokenAmount: request.poolTokenAmount,
            timeElapsed: currentTime - request.createdAt
        });

        return CompletedWithdrawal({ poolToken: request.poolToken, poolTokenAmount: request.poolTokenAmount });
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
     * @dev sets withdrawal window duration
     *
     * notes:
     *
     * - updating it will affect existing locked positions retroactively
     */
    function _setWithdrawalWindowDuration(uint32 newWithdrawalWindowDuration) private {
        uint32 prevWithdrawalWindowDuration = _withdrawalWindowDuration;
        if (prevWithdrawalWindowDuration == newWithdrawalWindowDuration) {
            return;
        }

        _withdrawalWindowDuration = newWithdrawalWindowDuration;

        emit WithdrawalWindowDurationUpdated({
            prevWithdrawalWindowDuration: prevWithdrawalWindowDuration,
            newWithdrawalWindowDuration: newWithdrawalWindowDuration
        });
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
        ReserveToken pool = poolToken.reserveToken();
        if (!_network.isPoolValid(pool)) {
            revert InvalidPool();
        }

        // record the current withdrawal request alongside previous pending withdrawal requests
        uint256 id = _nextWithdrawalRequestId;
        _nextWithdrawalRequestId = uncheckedInc(_nextWithdrawalRequestId);

        _withdrawalRequests[id] = WithdrawalRequest({
            provider: provider,
            poolToken: poolToken,
            poolTokenAmount: poolTokenAmount,
            createdAt: _time()
        });

        if (!_withdrawalRequestIdsByProvider[provider].add(id)) {
            revert AlreadyExists();
        }

        // transfer the pool tokens from the provider. Note, that the provider should have either previously
        // approved the pool token amount or provided a EIP712 typed signture for an EIP2612 permit request
        poolToken.safeTransferFrom(provider, address(this), poolTokenAmount);

        emit WithdrawalInitiated({ pool: pool, provider: provider, requestId: id, poolTokenAmount: poolTokenAmount });
    }

    /**
     * @dev cancels a withdrawal request
     */
    function _cancelWithdrawal(WithdrawalRequest memory request, uint256 id) private {
        // remove the withdrawal request and its id from the storage
        _removeWithdrawalRequest(request, id);

        // transfer the locked pool tokens back to the provider
        request.poolToken.safeTransfer(request.provider, request.poolTokenAmount);

        emit WithdrawalCancelled({
            pool: request.poolToken.reserveToken(),
            provider: request.provider,
            requestId: id,
            poolTokenAmount: request.poolTokenAmount,
            timeElapsed: _time() - request.createdAt
        });
    }

    /**
     * @dev removes withdrawal request
     */
    function _removeWithdrawalRequest(WithdrawalRequest memory request, uint256 id) private {
        delete _withdrawalRequests[id];

        if (!_withdrawalRequestIdsByProvider[request.provider].remove(id)) {
            revert DoesNotExist();
        }
    }

    /**
     * @dev returns whether it's possible to withdraw a request at the provided time (i.e., that it's older than the
     * lock duration but not older than the lock duration + withdrawal window duration)
     */
    function _canWithdrawAt(uint32 time, uint32 createdAt) private view returns (bool) {
        uint32 withdrawalStartTime = createdAt + _lockDuration;
        uint32 withdrawalEndTime = withdrawalStartTime + _withdrawalWindowDuration;

        return withdrawalStartTime <= time && time <= withdrawalEndTime;
    }
}

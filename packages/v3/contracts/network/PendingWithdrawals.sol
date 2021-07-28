// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "../utility/OwnedUpgradeable.sol";
import "../utility/Upgradeable.sol";
import "../utility/Utils.sol";
import "../utility/Time.sol";

import "./interfaces/IPendingWithdrawals.sol";

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
    using SafeERC20 for IPoolToken;

    uint256 private constant DEFAULT_LOCK_DURATION = 7 days;
    uint256 private constant DEFAULT_WITHDRAWAL_WINDOW_DURATION = 3 days;

    // the network contract
    IBancorNetwork private immutable _network;

    // the network token pool contract
    INetworkTokenPool private immutable _networkTokenPool;

    // a mapping between accounts and their pending positions
    mapping(address => Position[]) private _positions;

    // the lock duration
    uint256 private _lockDuration;

    // the withdrawal window duration
    uint256 private _withdrawalWindowDuration;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 3] private __gap;

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
        uint256 indexed positionIndex,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when a provider cancels a liquidity withdrawal request
     */
    event WithdrawalCancelled(
        IReserveToken indexed pool,
        address indexed provider,
        uint256 indexed positionIndex,
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
        uint256 positionIndex,
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
    function positions(address account) external view override returns (Position[] memory) {
        return _positions[account];
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
        Position[] storage providerPositions = _positions[provider];
        providerPositions.push(Position({ poolToken: poolToken, amount: poolTokenAmount, createdAt: _time() }));

        // transfer the pool tokens from the provider. Please keep in mind, that the provide should have either previously
        // approved the pool token amount or provided a EIP712 typed signture for an EIP2612 permit request
        poolToken.safeTransferFrom(provider, address(this), poolTokenAmount);

        emit WithdrawalInitiated(pool, provider, providerPositions.length - 1, poolTokenAmount);
    }
}

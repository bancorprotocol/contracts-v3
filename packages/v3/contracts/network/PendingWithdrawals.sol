// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../utility/OwnedUpgradeable.sol";
import "../utility/Upgradeable.sol";
import "../utility/Utils.sol";

import "./interfaces/IPendingWithdrawals.sol";

/**
 * @dev Bancor Network contract
 */
contract PendingWithdrawals is IPendingWithdrawals, Upgradeable, OwnedUpgradeable, Utils {
    uint256 private constant DEFAULT_LOCK_DURATION = 7 days;
    uint256 private constant DEFAULT_REMOVAL_WINDOW_DURATION = 3 days;

    // a mapping between accounts and their pending positions
    mapping(address => Position[]) private _positions;

    // the withdrawal locking duration
    uint256 private _lockDuration;

    // the removal window duration
    uint256 private _removalWindowDuration;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 3] private __gap;

    /**
     * @dev triggered when the withdrawal locking duration is updated
     */
    event LockDurationUpdated(uint256 prevLockDuration, uint256 newLockDuration);

    /**
     * @dev triggered when removal window duration
     */
    event RemovalWindowDurationUpdated(uint256 prevRemovalWindowDuration, uint256 newRemovalWindowDuration);

    /**
     * @dev triggered when a provider requests to initialize a liquidity withdrawal
     */
    event WithdrawalInitialized(
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
        uint256 timeElapsed
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
        uint256 timeElapsed
    );

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
        __Owned_init();

        __PendingWithdrawals_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __PendingWithdrawals_init_unchained() internal initializer {
        _lockDuration = DEFAULT_LOCK_DURATION;
        _removalWindowDuration = DEFAULT_REMOVAL_WINDOW_DURATION;
    }

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @dev returns mapping between accounts and their pending positions
     */
    function positions(address account) external view override returns (Position[] memory) {
        return _positions[account];
    }

    /**
     * @dev returns the withdrawal locking duration
     */
    function lockDuration() external view override returns (uint256) {
        return _lockDuration;
    }

    /**
     * @dev sets the withdrawal locking duration.
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
     * @dev returns removal window duration
     */
    function removalWindowDuration() external view override returns (uint256) {
        return _removalWindowDuration;
    }

    /**
     * @dev sets removal window duration.
     *
     * notes:
     *
     * - updating it will affect existing locked positions retroactively
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setRemovalWindowDuration(uint256 newRemovalWindowDuration) external onlyOwner {
        emit RemovalWindowDurationUpdated(_removalWindowDuration, newRemovalWindowDuration);

        _removalWindowDuration = newRemovalWindowDuration;
    }
}

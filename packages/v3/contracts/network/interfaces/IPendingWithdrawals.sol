// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../../pools/interfaces/IPoolToken.sol";

import "../../token/interfaces/IReserveToken.sol";

import "../../utility/interfaces/IUpgradeable.sol";

/**
 * @dev Pending Withdrawals interface
 */
interface IPendingWithdrawals is IUpgradeable {
    struct Position {
        IPoolToken poolToken;
        uint256 amount;
        uint256 createdAt;
    }

    /**
     * @dev returns mapping between accounts and their pending positions
     */
    function positions(address account) external view returns (Position[] memory);

    /**
     * @dev returns the lock duration
     */
    function lockDuration() external view returns (uint256);

    /**
     * @dev returns withdrawal window duration
     */
    function withdrawalWindowDuration() external view returns (uint256);
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../../pools/interfaces/IPoolToken.sol";
import "../../pools/interfaces/INetworkTokenPool.sol";

import "../../token/interfaces/IReserveToken.sol";

import "../../utility/interfaces/IUpgradeable.sol";

import "./IBancorNetwork.sol";

/**
 * @dev Pending Withdrawals interface
 */
interface IPendingWithdrawals is IUpgradeable {
    struct Position {
        IPoolToken poolToken;
        uint256 amount;
        uint256 createdAt;
    }

    function network() external view returns (IBancorNetwork);

    function networkTokenPool() external view returns (INetworkTokenPool);

    function positions(address account) external view returns (Position[] memory);

    function lockDuration() external view returns (uint256);

    function withdrawalWindowDuration() external view returns (uint256);
}

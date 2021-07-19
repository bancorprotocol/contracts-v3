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

    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev returns the network token pool contract
     */
    function networkTokenPool() external view returns (INetworkTokenPool);

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

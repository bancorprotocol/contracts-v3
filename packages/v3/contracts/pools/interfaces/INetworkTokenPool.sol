// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "./IPoolToken.sol";

import "../../utility/interfaces/IUpgradeable.sol";

import "../../network/interfaces/IBancorNetwork.sol";
import "../../network/interfaces/IBancorVault.sol";

/**
 * @dev Network Token Pool interface
 */
interface INetworkTokenPool is IUpgradeable {
    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev returns the vault contract
     */
    function vault() external view returns (IBancorVault);

    /**
     * @dev returns the network token pool token contract
     */
    function poolToken() external view returns (IPoolToken);

    /**
     * @dev returns the total staked network token balance in the network
     */
    function stakedBalance() external view returns (uint256);

    /**
     * @dev returns the total minted amount for a given pool
     */
    function mintedAmounts(IReserveToken pool) external view returns (uint256);
}

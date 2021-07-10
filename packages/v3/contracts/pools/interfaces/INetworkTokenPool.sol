// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../../utility/interfaces/IUpgradeable.sol";

import "../../network/interfaces/IBancorNetwork.sol";
import "../../network/interfaces/IBancorVault.sol";

/**
 * @dev Network Token Pool interface
 */
interface INetworkTokenPool is IUpgradeable {
    function network() external view returns (IBancorNetwork);

    function vault() external view returns (IBancorVault);

    function stakedBalance() external view returns (uint256);

    function mintedAmounts(IReserveToken pool) external view returns (uint256);
}

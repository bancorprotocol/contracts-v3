// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IPoolToken } from "./IPoolToken.sol";

import { IReserveToken } from "../../token/interfaces/IReserveToken.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";
import { IBancorVault } from "../../network/interfaces/IBancorVault.sol";

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

    function requestLiquidity(bytes32 contextId, IReserveToken pool, uint256 amount) external;

    function renounceLiquidity(bytes32 contextId, IReserveToken pool, uint256 amount) external;
}

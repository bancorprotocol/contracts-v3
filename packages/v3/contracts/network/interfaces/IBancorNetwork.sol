// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../../utility/interfaces/IUpgradeable.sol";

import "../../token/interfaces/IReserveToken.sol";

import "../../pools/interfaces/ILiquidityPoolCollection.sol";

import "./INetworkSettings.sol";
import "./IPendingWithdrawals.sol";

/**
 * @dev Bancor Network interface
 */
interface IBancorNetwork is IUpgradeable {
    function settings() external view returns (INetworkSettings);

    function pendingWithdrawals() external view returns (IPendingWithdrawals);

    function insuranceWallet() external view returns (ITokenHolder);

    function poolCollections() external view returns (ILiquidityPoolCollection[] memory);

    function latestPoolCollection(uint16 poolType) external view returns (ILiquidityPoolCollection);

    function liquidityPools() external view returns (ILiquidityPoolCollection[] memory);

    function collectionByPool(IReserveToken pool) external view returns (ILiquidityPoolCollection);
}

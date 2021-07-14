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
    /**
     * @dev returns the network settings contract
     */
    function settings() external view returns (INetworkSettings);

    /**
     * @dev returns the pending withdrawals contract
     */
    function pendingWithdrawals() external view returns (IPendingWithdrawals);

    /**
     * @dev returns the address of the protection wallet
     */
    function protectionWallet() external view returns (ITokenHolder);

    /**
     * @dev returns the set of all valid liquidity pool collections
     */
    function poolCollections() external view returns (ILiquidityPoolCollection[] memory);

    /**
     * @dev returns the most recent collection that was added to the liquidity pool collections set for a specific type
     */
    function latestPoolCollection(uint16 poolType) external view returns (ILiquidityPoolCollection);

    /**
     * @dev returns the set of all liquidity pools
     */
    function liquidityPools() external view returns (ILiquidityPoolCollection[] memory);

    /**
     * @dev returns the respective liquidity pool collection for the provided pool
     */
    function collectionByPool(IReserveToken pool) external view returns (ILiquidityPoolCollection);
}

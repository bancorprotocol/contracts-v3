// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../../utility/Types.sol";

import "../../token/interfaces/IReserveToken.sol";

import "../../network/interfaces/INetworkSettings.sol";
import "../../network/interfaces/IBancorNetwork.sol";

import "./IPoolToken.sol";

/**
 * @dev Liquidity Pool Collection interface
 */
interface ILiquidityPoolCollection {
    struct Pool {
        IPoolToken poolToken;
        uint32 tradingFeePPM;
        bool depositsEnabled;
        uint256 tradingLiquidity;
        uint256 tradingLiquidityProduct;
        uint256 stakedBalance;
        Fraction initialRate;
        uint256 depositLimit;
    }

    /**
     * @dev returns the type of the pool
     */
    function poolType() external pure returns (uint16);

    /**
     * @dev returns the network settings contract
     */
    function settings() external view returns (INetworkSettings);

    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev returns the custom symbol overrides for a given reserve token
     */
    function tokenSymbolOverride(IReserveToken reserveToken) external view returns (string memory);

    /**
     * @dev returns the default trading fee (in units of PPM)
     */
    function defaultTradingFeePPM() external view returns (uint32);

    /**
     * @dev returns the pool token of a given pool
     */
    function poolToken(IReserveToken reserveToken) external view returns (IPoolToken);

    /**
     * @dev returns the trading fee of a given pool
     */
    function tradingFeePPM(IReserveToken reserveToken) external view returns (uint32);

    /**
     * @dev returns whether deposits to a given pool are enabled.
     */
    function depositsEnabled(IReserveToken reserveToken) external view returns (bool);

    /**
     * @dev returns the trading liquidity in a given pool
     */
    function tradingLiquidity(IReserveToken reserveToken) external view returns (uint256, uint256);

    /**
     * @dev returns the trading liquidity product in a given pool
     */
    function tradingLiquidityProduct(IReserveToken reserveToken) external view returns (uint256);

    /**
     * @dev returns the staked balance in a given pool
     */
    function stakedBalance(IReserveToken reserveToken) external view returns (uint256);

    /**
     * @dev returns the initial rate of a given pool
     */
    function initialRate(IReserveToken reserveToken) external view returns (Fraction memory);

    /**
     * @dev returns the deposit limit of a given pool
     */
    function depositLimit(IReserveToken reserveToken) external view returns (uint256);

    /**
     * @dev creates a new pool
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the pool should have been whitelisted
     * - the pool isn't already defined in the collection
     */
    function createPool(IReserveToken reserveToken) external;
}

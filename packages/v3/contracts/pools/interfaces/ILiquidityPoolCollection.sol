// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../../utility/Types.sol";

import "../../token/interfaces/IReserveToken.sol";

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
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev returns the custom symbol overrides for a given reserve token
     */
    function tokenSymbolOverride(IReserveToken reserveToken) external view returns (string memory);

    /**
     * @dev returns the pool data for a given reserve token
     */
    function poolData(IReserveToken reserveToken) external view returns (Pool memory);

    /**
     * @dev returns the default trading fee (in units of PPM)
     */
    function defaultTradingFeePPM() external view returns (uint32);

    /**
     * @dev creates a new pool
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the pool should have been whitelisted
     * - the pool hasn't been listed already
     */
    function createPool(IReserveToken reserveToken) external;
}

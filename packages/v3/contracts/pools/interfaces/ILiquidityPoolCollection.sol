// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../../utility/Types.sol";

import "../../token/interfaces/IReserveToken.sol";

import "../../network/interfaces/IBancorNetwork.sol";

import "./IPoolToken.sol";

/**
 * @dev Liquidity Pool Collection interfaces
 */
interface ILiquidityPoolCollection {
    struct Pool {
        IPoolToken poolToken;
        uint256 tradingLiquidity;
        uint256 tradingLiquidityProduct;
        uint256 stakedBalance;
        Fraction initialRate;
        uint256 depositLimit;
        uint32 tradingFeePPM;
        bool depositsEnabled;
    }

    function poolType() external pure returns (uint16);

    function network() external view returns (IBancorNetwork);

    function tokenSymbolOverride(IReserveToken reserveToken) external view returns (string memory);

    function pool(IReserveToken reserveToken) external view returns (Pool memory);

    function defaultTradingFeePPM() external view returns (uint32);
}

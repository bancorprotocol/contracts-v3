// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../../utility/Types.sol";

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
}

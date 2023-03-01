// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import "../arbitrage/BancorArbitrage.sol";

contract TestBancorArbitrage is BancorArbitrage {
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;
    using Address for address payable;

    constructor(
        IERC20 initBnt,
        IBancorNetworkV2 initBancorNetworkV2,
        IBancorNetwork initBancorNetworkV3,
        IUniswapV2Router02 initUniswapV2Router,
        ISwapRouter initUniswapV3Router,
        IUniswapV2Router02 initSushiswapV2Router
    )
        BancorArbitrage(
            initBnt,
            initBancorNetworkV2,
            initBancorNetworkV3,
            initUniswapV2Router,
            initUniswapV3Router,
            initSushiswapV2Router
        )
    {}
}

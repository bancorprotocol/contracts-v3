// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import "../arbitrage/BancorArbitrage.sol";



contract TestBancorArbitrage is BancorArbitrage {
    using SafeERC20 for IERC20;
    using SafeERC20 for IPoolToken;
    using TokenLibrary for Token;
    using Address for address payable;

    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initBnt,
        IUniswapV3Router initUniswapV3Router,
        IUniswapV2Router02 initUniswapV2Router,
        IUniswapV2Factory initUniswapV2Factory,
        IBancorNetworkV2 initBancorNetworkV2,
        IUniswapV2Router02 initSushiswapV2Router
    )
        BancorArbitrage(
            initNetwork,
            initNetworkSettings,
            initBnt,
            initUniswapV3Router,
            initUniswapV2Router,
            initUniswapV2Factory,
            initBancorNetworkV2,
            initSushiswapV2Router
            //			initSushiswapV2Factory
        )
    {}
}

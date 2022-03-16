// SPDX-License-Identifier: SEE LICENSE IN LICENSE

pragma solidity 0.8.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MockUniswapV2Pair } from "./MockUniswapV2Pair.sol";
import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";
import { Utils } from "../utility/Utils.sol";
import { TestERC20Token } from "./TestERC20Token.sol";

contract MockUniswapV2Router02 is TestERC20Token, Utils {
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;

    MockUniswapV2Pair private _pair;

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        MockUniswapV2Pair pair
    ) TestERC20Token(name, symbol, totalSupply) {
        _pair = pair;
    }

    function removeLiquidity(
        address, /*tokenA*/
        address, /*tokenB*/
        uint256 liquidity,
        uint256, /*amountAMin*/
        uint256, /*amountBMin*/
        address, /*to*/
        uint256 /*deadline*/
    ) external returns (uint256 amountA, uint256 amountB) {
        // mimic approval
        Token(address(_pair)).safeTransferFrom(msg.sender, address(_pair), liquidity);
        // mimic Uniswap burn
        _pair.burn(msg.sender, liquidity);

        amountA = liquidity;
        amountB = liquidity;
    }

    function removeLiquidityETH(
        address, /*token*/
        uint256 liquidity,
        uint256, /*amountTokenMin*/
        uint256, /*amountETHMin*/
        address, /*to*/
        uint256 /*deadline*/
    ) external returns (uint256 amountToken, uint256 amountETH) {
        // mimic approval
        Token(address(_pair)).safeTransferFrom(msg.sender, address(_pair), liquidity);

        // mimic Uniswap burn
        _pair.burn(msg.sender, liquidity);

        amountToken = liquidity;
        amountETH = liquidity;
    }
}

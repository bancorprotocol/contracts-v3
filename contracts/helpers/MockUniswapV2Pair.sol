// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IUniswapV2Pair } from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import { IUniswapV2Router02 } from "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";
import { Utils } from "../utility/Utils.sol";

import { TestERC20Token } from "./TestERC20Token.sol";

contract MockUniswapV2Pair is TestERC20Token, Utils {
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) TestERC20Token(name, symbol, totalSupply) {}

    Token public token0;
    Token public token1;

    function setTokens(Token token0_, Token token1_) external {
        token0 = token0_;
        token1 = token1_;
    }

    function burn(address to, uint256 amount) external {
        Token[2] memory tokens = [token0, token1];

        for (uint256 i = 0; i < 2; i++) {
            if (tokens[i].isNative()) {
                payable(address(to)).transfer(amount);
            } else {
                tokens[i].safeTransfer(to, amount);
            }
        }
    }

    receive() external payable {}
}

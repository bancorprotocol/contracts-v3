// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { Utils } from "../utility/Utils.sol";

import { TestERC20Token } from "./TestERC20Token.sol";

contract MockUniswapV2Pair is TestERC20Token, Utils {
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;

    address private immutable _weth;

    Token public token0;
    Token public token1;

    constructor(uint256 totalSupply, address weth) TestERC20Token("Uniswap V2", "UNI-V2", totalSupply) {
        _weth = weth;
    }

    function setTokens(Token token0_, Token token1_) external {
        token0 = token0_;
        token1 = token1_;
    }

    function burn(address to, uint256 amount) external {
        Token[2] memory tokens = [token0, token1];

        for (uint256 i = 0; i < 2; i++) {
            if (address(tokens[i]) == _weth) {
                payable(address(to)).transfer(amount);
            } else {
                tokens[i].safeTransfer(to, amount);
            }
        }
    }

    receive() external payable {}
}

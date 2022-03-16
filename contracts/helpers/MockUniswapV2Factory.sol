// SPDX-License-Identifier: SEE LICENSE IN LICENSE

pragma solidity 0.8.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MockUniswapV2Pair } from "./MockUniswapV2Pair.sol";
import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";
import { Utils } from "../utility/Utils.sol";
import { TestERC20Token } from "./TestERC20Token.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract MockUniswapV2Factory is TestERC20Token, Utils {
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _tokens;
    MockUniswapV2Pair private _pair;

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        MockUniswapV2Pair pair
    ) TestERC20Token(name, symbol, totalSupply) {
        _pair = pair;
    }

    function getPair(address token0, address token1) external view returns (address) {
        if (_tokens.contains(token0) && _tokens.contains(token1)) {
            return address(_pair);
        }
        return address(0);
    }

    function setTokens(address token0, address token1) external {
        _tokens.add(token0);
        _tokens.add(token1);
    }
}

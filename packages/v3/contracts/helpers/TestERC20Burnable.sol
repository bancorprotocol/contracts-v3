// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { ERC20Burnable } from "../token/ERC20Burnable.sol";

import { TestERC20Token } from "./TestERC20Token.sol";

contract TestERC20Burnable is TestERC20Token, ERC20Burnable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) TestERC20Token(name, symbol, totalSupply) {}
}

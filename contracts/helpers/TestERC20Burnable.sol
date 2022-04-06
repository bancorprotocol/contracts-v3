// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { ERC20Burnable } from "../token/ERC20Burnable.sol";

import { TestERC20Token } from "./TestERC20Token.sol";

contract TestERC20Burnable is TestERC20Token, ERC20Burnable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) TestERC20Token(name, symbol, totalSupply) {}

    function decimals() public view virtual override(ERC20, TestERC20Token) returns (uint8) {
        return TestERC20Token.decimals();
    }
}

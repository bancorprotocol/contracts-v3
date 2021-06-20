// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../token/ERC20Burnable.sol";

import "./TestStandardToken.sol";

contract TestERC20Burnable is TestStandardToken, ERC20Burnable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) TestStandardToken(name, symbol, totalSupply) {}
}

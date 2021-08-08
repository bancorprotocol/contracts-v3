// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IMintableToken } from "@bancor/token-governance/contracts/IMintableToken.sol";

contract TestERC20Token is IMintableToken, ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, totalSupply);
    }

    function issue(address to, uint256 amount) external override {
        _mint(to, amount);
    }

    function destroy(address from, uint256 amount) external override {
        _burn(from, amount);
    }
}

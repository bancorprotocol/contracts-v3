// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IMintableToken } from "@bancor/token-governance/contracts/IMintableToken.sol";

import { TestERC20Token } from "./TestERC20Token.sol";

contract TestGovernedToken is IMintableToken, TestERC20Token {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) TestERC20Token(name, symbol, totalSupply) {
        _mint(msg.sender, totalSupply);
    }

    function issue(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function destroy(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function owner() external pure returns (address) {
        return address(0);
    }

    function transferOwnership(address newOwner) external {}

    function acceptOwnership() external {}
}

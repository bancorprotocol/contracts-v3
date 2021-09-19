// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IMintableToken } from "@bancor/token-governance/0.7.6/contracts/IMintableToken.sol";
import { IClaimable } from "@bancor/token-governance/0.7.6/contracts/IClaimable.sol";

import { Owned } from "../utility/Owned.sol";

import { TestERC20Token } from "./TestERC20Token.sol";

contract TestSystemToken is IMintableToken, Owned, TestERC20Token {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) TestERC20Token(name, symbol, totalSupply) {}

    function issue(address to, uint256 amount) external override {
        _mint(to, amount);
    }

    function destroy(address from, uint256 amount) external override {
        _burn(from, amount);
    }

    function owner() public view override(IClaimable, Owned) returns (address) {
        return super.owner();
    }

    function transferOwnership(address newOwner) public override(IClaimable, Owned) {
        super.transferOwnership(newOwner);
    }

    function acceptOwnership() public override(IClaimable, Owned) {
        super.acceptOwnership();
    }
}

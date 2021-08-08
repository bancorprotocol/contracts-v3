// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IMintableToken } from "@bancor/token-governance/0.7.6/contracts/IMintableToken.sol";
import { IClaimable } from "@bancor/token-governance/0.7.6/contracts/IClaimable.sol";

import { OwnedUpgradeable } from "../utility/OwnedUpgradeable.sol";

import { TestERC20Token } from "./TestERC20Token.sol";

contract TestSystemToken is IMintableToken, OwnedUpgradeable, TestERC20Token {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) TestERC20Token(name, symbol, totalSupply) {
        __Owned_init();
    }

    function version() external pure override returns (uint16) {
        return 1;
    }

    function issue(address to, uint256 amount) external override {
        _mint(to, amount);
    }

    function destroy(address from, uint256 amount) external override {
        _burn(from, amount);
    }

    function owner() public view override(IClaimable, OwnedUpgradeable) returns (address) {
        return super.owner();
    }

    function transferOwnership(address newOwner) public override(IClaimable, OwnedUpgradeable) {
        super.transferOwnership(newOwner);
    }

    function acceptOwnership() public override(IClaimable, OwnedUpgradeable) {
        super.acceptOwnership();
    }
}

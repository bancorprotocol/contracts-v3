// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

contract TestERC20Token is ERC20Permit {
    uint8 private _decimals = 18;

    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) ERC20(name, symbol) ERC20Permit(name) {
        _mint(msg.sender, totalSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function updateDecimals(uint8 newDecimals) external {
        _decimals = newDecimals;
    }
}

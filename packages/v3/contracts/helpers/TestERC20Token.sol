// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract TestERC20Token is ERC20Upgradeable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) {
        __ERC20_init(name, symbol);

        _mint(msg.sender, totalSupply);
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { IERC20Burnable } from "./interfaces/IERC20Burnable.sol";

/**
 * @dev This is an adapted clone of the OZ's ERC20Burnable extension which is unfortunately required so that it can be
 * explicitly specified in interfaces via our new IERC20Burnable interface.
 *
 * We have also removed the explicit use of Context and updated the code to our style.
 */
abstract contract ERC20Burnable is ERC20, IERC20Burnable {
    /**
     * @inheritdoc IERC20Burnable
     */
    function burn(uint256 amount) external virtual override {
        _burn(msg.sender, amount);
    }

    /**
     * @inheritdoc IERC20Burnable
     */
    function burnFrom(address recipient, uint256 amount) external virtual override {
        uint256 currentAllowance = allowance(recipient, msg.sender);
        require(currentAllowance >= amount, "ERR_INSUFFICIENT_ALLOWANCE");
        unchecked {
            _approve(recipient, msg.sender, currentAllowance - amount);
        }
        _burn(recipient, amount);
    }
}

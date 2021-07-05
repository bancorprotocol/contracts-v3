// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IERC20Burnable.sol";

/**
 * @dev This is a clone of the OZ's ERC20Burnable extension which is unfortunately required so that it can be explicitly
 * specified in interfaces via our new IERC20Burnable interface.
 *
 * We have also removed the explicit use of Context and updated the code to our style.
 */
abstract contract ERC20Burnable is IERC20Burnable, ERC20Upgradeable {
    using SafeMath for uint256;

    /**
     * @dev Destroys tokens from the caller.
     */
    function burn(uint256 amount) external virtual override {
        _burn(msg.sender, amount);
    }

    /**
     * @dev Destroys tokens from a recipient, deducting from the caller's allowance
     *
     * requirements:
     *
     * - the caller must have allowance for recipient's tokens of at least the specified amount
     */
    function burnFrom(address recipient, uint256 amount) external virtual override {
        uint256 decreasedAllowance = allowance(recipient, msg.sender).sub(amount, "ERR_INSUFFICIENT_ALLOWANCE");

        _approve(recipient, msg.sender, decreasedAllowance);

        _burn(recipient, amount);
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "@openzeppelin/contracts-upgradeable/drafts/IERC20PermitUpgradeable.sol";

import "./IERC20Burnable.sol";

/**
 * @dev Pool Token interface
 */
interface IPoolToken is IERC20Upgradeable, IERC20Burnable, IERC20PermitUpgradeable {
    function mint(address recipient, uint256 amount) external;
}

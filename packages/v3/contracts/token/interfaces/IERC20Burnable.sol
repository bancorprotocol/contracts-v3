// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @dev Burnable ERC20 interface
 */
interface IERC20Burnable is IERC20Upgradeable {
    function burn(uint256 amount) external;

    function burnFrom(address recipient, uint256 amount) external;
}

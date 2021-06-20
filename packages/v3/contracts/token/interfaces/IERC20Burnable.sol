// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

/**
 * @dev Burnable ERC20 interface
 */
interface IERC20Burnable {
    function burn(uint256 amount) external;

    function burnFrom(address recipient, uint256 amount) external;
}

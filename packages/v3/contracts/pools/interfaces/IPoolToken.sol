// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts/drafts/IERC20Permit.sol";

import "../../token/interfaces/IERC20Burnable.sol";

/**
 * @dev Pool Token interface
 */
interface IPoolToken is IERC20, IERC20Permit, IERC20Burnable {
    /**
     * @dev increases the token supply and sends the new tokens to the given account
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function mint(address recipient, uint256 amount) external;
}

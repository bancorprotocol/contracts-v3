// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@openzeppelin/contracts/drafts/ERC20Permit.sol";

import "./interfaces/IPoolToken.sol";

import "../utility/Owned.sol";
import "../utility/Utils.sol";

import "./ERC20Burnable.sol";

/**
 * @dev This contract implements a mintable, burnable, and EIP2612 signed approvals
 */
contract PoolToken is IPoolToken, ERC20Permit, ERC20Burnable, Owned, Utils {
    /**
     * @dev initializes a new PoolToken contract
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) ERC20(name, symbol) ERC20Permit("Bancor") {
        _setupDecimals(decimals);
    }

    /**
     * @dev increases the token supply and sends the new tokens to the given account
     *
     * Requirements:
     *
     * - the caller must be the owner of the contract
     */
    function mint(address recipient, uint256 amount) external override onlyOwner validExternalAddress(recipient) {
        _mint(recipient, amount);
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@openzeppelin/contracts/drafts/ERC20Permit.sol";

import "./interfaces/IPoolToken.sol";
import "./interfaces/IReserveToken.sol";

import "../utility/OwnedUpgradeable.sol";
import "../utility/Utils.sol";

import "./ERC20Burnable.sol";

/**
 * @dev This contract implements a mintable, burnable, and EIP2612 signed approvals
 */
contract PoolToken is IPoolToken, ERC20Permit, ERC20Burnable, OwnedUpgradeable, Utils {
    IReserveToken private immutable _reserveToken;

    /**
     * @dev initializes a new PoolToken contract
     */
    constructor(
        string memory name,
        string memory symbol,
        IReserveToken initReserveToken
    ) ERC20(name, symbol) ERC20Permit(name) validAddress(address(initReserveToken)) {
        _reserveToken = initReserveToken;

        __Owned_init();
    }

    /**
     * @dev returns the address of the reserve token
     */
    function reserveToken() external view returns (IReserveToken) {
        return _reserveToken;
    }

    /**
     * @dev increases the token supply and sends the new tokens to the given account
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function mint(address recipient, uint256 amount) external override onlyOwner validExternalAddress(recipient) {
        _mint(recipient, amount);
    }
}

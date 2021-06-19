// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@openzeppelin/contracts/drafts/ERC20Permit.sol";

import "./interfaces/IPoolToken.sol";
import "./interfaces/IReserveToken.sol";

import "../utility/Owned.sol";
import "../utility/Utils.sol";

import "./ERC20Burnable.sol";

/**
 * @dev This contract implements a mintable, burnable, and EIP2612 signed approvals
 */
contract PoolToken is IPoolToken, ERC20Permit, ERC20Burnable, Owned, Utils {
    IReserveToken private immutable _baseToken;

    /**
     * @dev initializes a new PoolToken contract
     */
    constructor(
        string memory name,
        string memory symbol,
        IReserveToken initBaseToken
    ) ERC20(name, symbol) ERC20Permit(name) validAddress(address(initBaseToken)) {
        _baseToken = initBaseToken;
    }

    /**
     * @dev returns the address of the base token
     */
    function baseToken() external view returns (IReserveToken) {
        return _baseToken;
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

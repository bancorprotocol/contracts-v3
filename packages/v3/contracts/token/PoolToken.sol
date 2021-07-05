// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/drafts/ERC20PermitUpgradeable.sol";

import "./interfaces/IPoolToken.sol";
import "./interfaces/IReserveToken.sol";

import "../utility/OwnedUpgradeable.sol";
import "../utility/Utils.sol";

import "./ERC20Burnable.sol";

/**
 * @dev This contract implements a mintable, burnable, and EIP2612 signed approvals
 */
contract PoolToken is IPoolToken, ERC20Burnable, ERC20PermitUpgradeable, OwnedUpgradeable, Utils {
    string private constant POOL_TOKEN_SYMBOL_PREFIX = "bn";
    string private constant POOL_TOKEN_NAME_PREFIX = "Bancor";
    string private constant POOL_TOKEN_NAME_SUFFIX = "Pool Token";

    IReserveToken private immutable _reserveToken;

    /**
     * @dev initializes a new PoolToken contract. Unless, a custom symbol is provided, we'll try to derive the name and
     * the symbol of the pool token from the reserve token directly
     */
    constructor(IReserveToken initReserveToken, string memory customSymbol) validAddress(address(initReserveToken)) {
        __Owned_init();

        // user either the provided custom symbol or try to fetch it from the token itself
        string memory tokenSymbol = bytes(customSymbol).length != 0
            ? customSymbol
            : ERC20Upgradeable(address(initReserveToken)).symbol();

        string memory symbol = string(abi.encodePacked(POOL_TOKEN_SYMBOL_PREFIX, tokenSymbol));
        string memory name = string(
            abi.encodePacked(POOL_TOKEN_NAME_PREFIX, " ", tokenSymbol, " ", POOL_TOKEN_NAME_SUFFIX)
        );

        __ERC20_init(name, symbol);
        __ERC20Permit_init(name);

        _reserveToken = initReserveToken;
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
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

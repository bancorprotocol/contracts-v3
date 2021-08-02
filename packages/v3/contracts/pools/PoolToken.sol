// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/drafts/ERC20Permit.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";
import { ERC20Burnable } from "../token/ERC20Burnable.sol";

import { OwnedUpgradeable } from "../utility/OwnedUpgradeable.sol";
import { Utils } from "../utility/Utils.sol";

import { IPoolToken } from "./interfaces/IPoolToken.sol";

/**
 * @dev Pool Token contract
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
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPoolToken
     */
    function reserveToken() external view override returns (IReserveToken) {
        return _reserveToken;
    }

    /**
     * @inheritdoc IPoolToken
     */
    function mint(address recipient, uint256 amount) external override onlyOwner validExternalAddress(recipient) {
        _mint(recipient, amount);
    }
}

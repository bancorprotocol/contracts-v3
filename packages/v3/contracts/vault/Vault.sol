// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IVault } from "./interfaces/IVault.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { Utils, AccessDenied, NotPayable } from "../utility/Utils.sol";

abstract contract Vault is IVault, Upgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using Address for address payable;
    using SafeERC20 for IERC20;
    using ReserveTokenLibrary for ReserveToken;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor() {}

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __Vault_init() internal initializer {
        __Upgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        __Vault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __Vault_init_unchained() internal initializer {}

    /**
     * @inheritdoc IVault
     */
    function isPaused() external view returns (bool) {
        return paused();
    }

    /**
     * @inheritdoc IVault
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @inheritdoc IVault
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    /**
     * @inheritdoc IVault
     */
    function withdrawFunds(
        ReserveToken reserveToken,
        address payable target,
        uint256 amount
    ) external override validAddress(target) nonReentrant whenNotPaused {
        if (!authenticateWithdrawal(msg.sender, reserveToken, target, amount)) {
            revert AccessDenied();
        }

        if (reserveToken.isNativeToken()) {
            // using a regular transfer here would revert due to exceeding the 2300 gas limit which is why we're using
            // call instead (via sendValue), which the 2300 gas limit does not apply for
            target.sendValue(amount);
        } else {
            reserveToken.safeTransfer(target, amount);
        }

        emit FundsWithdrawn({ token: reserveToken, caller: msg.sender, target: target, amount: amount });
    }

    /**
     * @inheritdoc IVault
     */
    function authenticateWithdrawal(
        address caller,
        ReserveToken reserveToken,
        address target,
        uint256 amount
    ) public view virtual returns (bool);

    /**
     * @inheritdoc IVault
     */
    function isPayable() public view virtual returns (bool);

    receive() external payable {
        if (!isPayable()) {
            revert NotPayable();
        }
    }
}

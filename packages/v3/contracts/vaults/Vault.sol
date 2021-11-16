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
     * @dev returns whether withdrawals are currently paused
     */
    function isPaused() external view returns (bool) {
        return paused();
    }

    /**
     * @dev pauses withdrawals
     *
     * requirements:
     *
     * - the caller must have the ROLE_ADMIN privileges
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @dev unpauses withdrawals
     *
     * requirements:
     *
     * - the caller must have the ROLE_ADMIN privileges
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
     * @dev returns whether the given caller is allowed access to the given token
     */
    function authenticateWithdrawal(
        address caller,
        ReserveToken reserveToken,
        address target,
        uint256 amount
    ) internal view virtual returns (bool);

    /**
     * @inheritdoc IVault
     */
    function isPayable() public view virtual returns (bool);

    /**
     * @dev authorize the contract to receive ETH
     *
     * requirements:
     *
     * - isPayable must return true
     */
    receive() external payable {
        if (!isPayable()) {
            revert NotPayable();
        }
    }
}

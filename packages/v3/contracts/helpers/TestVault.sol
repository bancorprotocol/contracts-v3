// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { Vault } from "../vault/Vault.sol";

/**
 * @dev Bancor Vault contract
 */
contract TestVault is Vault {
    using SafeERC20 for IERC20;
    using ReserveTokenLibrary for ReserveToken;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __StakingRewardsVault_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __StakingRewardsVault_init() internal initializer {
        __Vault_init();

        __StakingRewardsVault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __StakingRewardsVault_init_unchained() internal initializer {}

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc Vault
     */
    function isPayable() public pure override returns (bool) {
        return true;
    }

    /**
     * @dev authenticate the right of a caller to withdraw a specific amount of a token to a target
     *
     * requirements:
     *
     * - NONE
     */
    function authenticateWithdrawal(
        address, /* caller */
        ReserveToken, /* reserverToken */
        address, /* target */
        uint256 /* amount */
    ) internal pure override returns (bool) {
        return true;
    }
}

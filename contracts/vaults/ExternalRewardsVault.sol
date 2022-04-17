// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";

import { Token } from "../token/Token.sol";

import { IExternalRewardsVault } from "./interfaces/IExternalRewardsVault.sol";
import { IVault, ROLE_ASSET_MANAGER } from "./interfaces/IVault.sol";
import { Vault } from "./Vault.sol";

/**
 * @dev External Rewards Vault contract
 */
contract ExternalRewardsVault is IExternalRewardsVault, Vault {
    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(ITokenGovernance initBNTGovernance, ITokenGovernance initVBNTGovernance)
        Vault(initBNTGovernance, initVBNTGovernance)
    {}

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __ExternalRewardsVault_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __ExternalRewardsVault_init() internal onlyInitializing {
        __Vault_init();

        __ExternalRewardsVault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __ExternalRewardsVault_init_unchained() internal onlyInitializing {
        // set up administrative roles
        _setRoleAdmin(ROLE_ASSET_MANAGER, ROLE_ADMIN);
    }

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc Vault
     */
    function isPayable() public pure override(IVault, Vault) returns (bool) {
        return true;
    }

    /**
     * @dev returns whether the given caller is allowed access to the given token
     *
     * requirements:
     *
     * - the caller must have the ROLE_ASSET_MANAGER role
     */
    function isAuthorizedWithdrawal(
        address caller,
        Token, /* Token */
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return hasRole(ROLE_ASSET_MANAGER, caller);
    }
}

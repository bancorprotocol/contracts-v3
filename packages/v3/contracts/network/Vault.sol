// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IVault } from "./interfaces/IVault.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { ReserveToken } from "../token/ReserveToken.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

abstract contract Vault is IVault, Upgradeable, ReentrancyGuardUpgradeable {
    // the admin role is used to pause/unpause the vault
    bytes32 public constant ROLE_ADMIN = keccak256("ROLE_ADMIN");

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor() {}

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __Vault_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __Vault_init() internal initializer {
        __Upgradeable_init();
        __ReentrancyGuard_init();

        __Vault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __Vault_init_unchained() internal initializer {
        // set up administrative roles
        _setRoleAdmin(ROLE_ADMIN, ROLE_ADMIN);

        // allow the deployer to initially govern the contract
        _setupRole(ROLE_ADMIN, msg.sender);
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @dev
     */
    function withdrawFunds(
        ReserveToken token,
        uint256 amount,
        address target
    ) public {
        // TODO
    }

    receive() external payable {}
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { IUpgradeable } from "./interfaces/IUpgradeable.sol";

/**
 * @dev this contract provides common utilities for upgradeable contracts
 */
abstract contract Upgradeable is IUpgradeable, Initializable, AccessControlUpgradeable {
    // the owner role is used for migrations during upgrades
    bytes32 public constant ROLE_OWNER = keccak256("ROLE_OWNER");

    uint32 internal constant MAX_GAP = 50;

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __Upgradeable_init() internal initializer {
        __AccessControl_init();

        __Upgradeable_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __Upgradeable_init_unchained() internal initializer {
        // set up administrative roles
        _setRoleAdmin(ROLE_OWNER, ROLE_OWNER);

        // allow the deployer to initially govern the contract
        _setupRole(ROLE_OWNER, msg.sender);
    }

    // solhint-enable func-name-mixedcase

    modifier onlyOwner() {
        _hasRole(ROLE_OWNER, msg.sender);

        _;
    }

    function _hasRole(bytes32 role, address account) internal view {
        require(hasRole(role, account), "ERR_ACCESS_DENIED");
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { AccessControlEnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import { IUpgradeable } from "./interfaces/IUpgradeable.sol";

import { AccessDenied } from "./Utils.sol";

/**
 * @dev this contract provides common utilities for upgradeable contracts
 *
 * note that we're using the Transparent Upgradeable Proxy pattern and *not* the Universal Upgradeable Proxy Standard
 * (UUPS) pattern, therefore initializing the implementation contracts is not necessary or required
 */
abstract contract Upgradeable is IUpgradeable, AccessControlEnumerableUpgradeable {
    error AlreadyInitialized();

    // the admin role is used to allow a non-proxy admin to perform additional initialization/setup during contract
    // upgrades
    bytes32 internal constant ROLE_ADMIN = keccak256("ROLE_ADMIN");

    uint32 internal constant MAX_GAP = 50;

    uint16 internal _initializations;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 1] private __gap;

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __Upgradeable_init() internal onlyInitializing {
        __AccessControl_init();

        __Upgradeable_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __Upgradeable_init_unchained() internal onlyInitializing {
        _initializations = 1;

        // set up administrative roles
        _setRoleAdmin(ROLE_ADMIN, ROLE_ADMIN);

        // allow the deployer to initially be the admin of the contract
        _setupRole(ROLE_ADMIN, msg.sender);
    }

    // solhint-enable func-name-mixedcase

    modifier onlyAdmin() {
        _hasRole(ROLE_ADMIN, msg.sender);

        _;
    }

    modifier onlyRoleMember(bytes32 role) {
        _hasRole(role, msg.sender);

        _;
    }

    function version() public view virtual override returns (uint16);

    /**
     * @dev returns the admin role
     */
    function roleAdmin() external pure returns (bytes32) {
        return ROLE_ADMIN;
    }

    /**
     * @dev performs post-upgrade initialization
     *
     * requirements:
     *
     * - this must can be called only once per-upgrade
     */
    function postUpgrade(bytes calldata data) external {
        uint16 initializations = _initializations + 1;

        if (initializations != version()) {
            revert AlreadyInitialized();
        }

        _initializations = initializations;

        _postUpgrade(data);
    }

    /**
     * @dev an optional post-upgrade callback that can be implemented by child contracts
     */
    function _postUpgrade(bytes calldata /* data */) internal virtual {}

    function _hasRole(bytes32 role, address account) internal view {
        if (!hasRole(role, account)) {
            revert AccessDenied();
        }
    }
}

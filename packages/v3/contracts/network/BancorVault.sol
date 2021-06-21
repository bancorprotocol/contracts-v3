// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import "../utility/Utils.sol";

import "../token/ReserveToken.sol";

import "./interfaces/IBancorVault.sol";

/**
 * @dev Bancor Vault contract
 */
contract BancorVault is IBancorVault, AccessControlUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using SafeERC20 for IERC20;
    using ReserveToken for IReserveToken;

    // the admin role is used to pause/unpause the vault
    bytes32 public constant ROLE_ADMIN = keccak256("ROLE_ADMIN");

    // the asset manager role is required to access all the reserves
    bytes32 public constant ROLE_ASSET_MANAGER = keccak256("ROLE_ASSET_MANAGER");

    // the asset manager role is only required to access the network token reserve
    bytes32 public constant ROLE_NETWORK_TOKEN_MANAGER = keccak256("ROLE_NETWORK_TOKEN_MANAGER");

    // the address of the network token
    IERC20 private immutable _networkToken;

    /**
     * @dev triggered when tokens have been withdrawn from the vault
     */
    event TokensWithdrawn(IReserveToken indexed reserveToken, address indexed target, uint256 amount);

    constructor(IERC20 networkToken) validAddress(address(networkToken)) {
        _networkToken = networkToken;
    }

    function initialize() external initializer {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        // set up administrative roles
        _setRoleAdmin(ROLE_ADMIN, ROLE_ADMIN);
        _setRoleAdmin(ROLE_ASSET_MANAGER, ROLE_ASSET_MANAGER);
        _setRoleAdmin(ROLE_NETWORK_TOKEN_MANAGER, ROLE_ASSET_MANAGER);

        // allow the deployer to initially govern the contract
        _setupRole(ROLE_ADMIN, msg.sender);
        _setupRole(ROLE_ASSET_MANAGER, msg.sender);
    }

    modifier onlyAdmin {
        _hasRole(ROLE_ADMIN);

        _;
    }

    function _hasRole(bytes32 role) internal view {
        require(hasRole(role, msg.sender), "ERR_ACCESS_DENIED");
    }

    // prettier-ignore
    receive() external payable override virtual {}

    function isPaused() external view virtual override returns (bool) {
        return paused();
    }

    function pause() external override onlyAdmin {
        _pause();
    }

    function unpause() external override onlyAdmin {
        _unpause();
    }

    /**
     * @dev withdraws funds held by the contract and sends them to an account
     *
     * Requirements:
     *
     * - the caller must have the right privileges to withdraw this token:
     *   - for the network token: the ROLE_NETWORK_TOKEN_MANAGER or the ROLE_ASSET_MANAGER role
     *   - for any other reserve token or ETH: the ROLE_ASSET_MANAGER role
     */
    function withdrawTokens(
        IReserveToken reserveToken,
        address payable target,
        uint256 amount
    ) external virtual override validAddress(target) nonReentrant whenNotPaused {
        require(
            (address(reserveToken) == address(_networkToken) &&
                (hasRole(ROLE_NETWORK_TOKEN_MANAGER, msg.sender) || hasRole(ROLE_ASSET_MANAGER, msg.sender))) ||
                hasRole(ROLE_ASSET_MANAGER, msg.sender),
            "ERR_ACCESS_DENIED"
        );

        reserveToken.safeTransfer(target, amount);

        emit TokensWithdrawn(reserveToken, target, amount);
    }
}

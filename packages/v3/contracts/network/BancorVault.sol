// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AccessDenied } from "../utility/Utils.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { IBancorVault } from "./interfaces/IBancorVault.sol";

/**
 * @dev Bancor Vault contract
 */
contract BancorVault is IBancorVault, Upgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using SafeERC20 for IERC20;
    using ReserveTokenLibrary for ReserveToken;

    // the asset manager role is required to access all the reserves
    bytes32 public constant ROLE_ASSET_MANAGER = keccak256("ROLE_ASSET_MANAGER");

    // the asset manager role is only required to access the network token reserve
    bytes32 public constant ROLE_NETWORK_TOKEN_MANAGER = keccak256("ROLE_NETWORK_TOKEN_MANAGER");

    // the address of the network token
    IERC20 private immutable _networkToken;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev triggered when tokens have been withdrawn from the vault
     */
    event TokensWithdrawn(ReserveToken indexed token, address indexed caller, address indexed target, uint256 amount);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IERC20 networkToken) validAddress(address(networkToken)) {
        _networkToken = networkToken;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __BancorVault_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorVault_init() internal initializer {
        __Upgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        __BancorVault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorVault_init_unchained() internal initializer {
        // set up administrative roles
        _setRoleAdmin(ROLE_ASSET_MANAGER, ROLE_ASSET_MANAGER);
        _setRoleAdmin(ROLE_NETWORK_TOKEN_MANAGER, ROLE_ASSET_MANAGER);

        // allow the deployer to initially be the asset manager of the contract
        _setupRole(ROLE_ASSET_MANAGER, msg.sender);
    }

    receive() external payable {}

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IBancorVault
     */
    function isPaused() external view returns (bool) {
        return paused();
    }

    /**
     * @inheritdoc IBancorVault
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @inheritdoc IBancorVault
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    /**
     * @inheritdoc IBancorVault
     */
    function withdrawTokens(
        ReserveToken reserveToken,
        address payable target,
        uint256 amount
    ) external validAddress(target) nonReentrant whenNotPaused {
        if (
            (reserveToken.toIERC20() == _networkToken && hasRole(ROLE_NETWORK_TOKEN_MANAGER, msg.sender)) ||
            hasRole(ROLE_ASSET_MANAGER, msg.sender)
        ) {
            reserveToken.safeTransfer(target, amount);

            emit TokensWithdrawn({ token: reserveToken, caller: msg.sender, target: target, amount: amount });
        } else {
            revert AccessDenied();
        }
    }
}

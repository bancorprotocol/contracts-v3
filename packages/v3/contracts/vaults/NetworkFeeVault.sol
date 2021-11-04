// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { Vault } from "./Vault.sol";
import { INetworkFeeVault } from "./interfaces/INetworkFeeVault.sol";
import { IVault } from "./interfaces/IVault.sol";

/**
 * @dev Network Fee Vault contract
 */
contract NetworkFeeVault is INetworkFeeVault, Vault {
    using SafeERC20 for IERC20;
    using ReserveTokenLibrary for ReserveToken;

    // the asset manager role is required to access all the reserves
    bytes32 public constant ROLE_ASSET_MANAGER = keccak256("ROLE_ASSET_MANAGER");

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
        __BancorVault_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorVault_init() internal initializer {
        __Vault_init();

        __BancorVault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorVault_init_unchained() internal initializer {
        // set up administrative roles
        _setRoleAdmin(ROLE_ASSET_MANAGER, ROLE_ADMIN);

        // allow the deployer to initially be the asset manager of the contract
        _setupRole(ROLE_ASSET_MANAGER, msg.sender);
    }

    /**
     * @inheritdoc Vault
     */
    function isPayable() public pure override(IVault, Vault) returns (bool) {
        return true;
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @dev returns whether the given caller is allowed access to the given token
     *
     * requirements:
     *
     * - the caller must have the ROLE_ASSET_MANAGER permission
     */
    function authenticateWithdrawal(
        address caller,
        ReserveToken, /* reserveToken */
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return hasRole(ROLE_ASSET_MANAGER, caller);
    }
}

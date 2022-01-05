// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { INetworkFeeVault } from "./interfaces/INetworkFeeVault.sol";
import { IVault } from "./interfaces/IVault.sol";
import { Vault } from "./Vault.sol";

/**
 * @dev Network Fee Vault contract
 */
contract NetworkFeeVault is INetworkFeeVault, Vault {
    using SafeERC20 for IERC20;
    using ReserveTokenLibrary for ReserveToken;

    // the asset manager role is required to access all the reserves
    bytes32 private constant ROLE_ASSET_MANAGER = keccak256("ROLE_ASSET_MANAGER");

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(ITokenGovernance initNetworkTokenGovernance, ITokenGovernance initGovTokenGovernance)
        Vault(initNetworkTokenGovernance, initGovTokenGovernance)
    {}

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __NetworkFeeVault_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __NetworkFeeVault_init() internal onlyInitializing {
        __Vault_init();

        __NetworkFeeVault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __NetworkFeeVault_init_unchained() internal onlyInitializing {
        // set up administrative roles
        _setRoleAdmin(ROLE_ASSET_MANAGER, ROLE_ADMIN);
    }

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc IVersioned
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc Vault
     */
    function isPayable() public pure override(IVault, Vault) returns (bool) {
        return true;
    }

    /**
     * @dev returns the asset manager role
     */
    function roleAssetManager() external pure returns (bytes32) {
        return ROLE_ASSET_MANAGER;
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
        ReserveToken, /* reserveToken */
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return hasRole(ROLE_ASSET_MANAGER, caller);
    }
}

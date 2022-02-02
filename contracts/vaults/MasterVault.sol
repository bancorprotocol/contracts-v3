// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IMasterVault } from "./interfaces/IMasterVault.sol";
import { IVault, ROLE_ASSET_MANAGER } from "./interfaces/IVault.sol";
import { Vault } from "./Vault.sol";

/**
 * @dev Master Vault contract
 */
contract MasterVault is IMasterVault, Vault {
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;

    // the network token manager role is only required to access the network token reserve
    bytes32 private constant ROLE_NETWORK_TOKEN_MANAGER = keccak256("ROLE_NETWORK_TOKEN_MANAGER");

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
        __MasterVault_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __MasterVault_init() internal onlyInitializing {
        __Vault_init();

        __MasterVault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __MasterVault_init_unchained() internal onlyInitializing {
        // set up administrative roles
        _setRoleAdmin(ROLE_ASSET_MANAGER, ROLE_ADMIN);
        _setRoleAdmin(ROLE_NETWORK_TOKEN_MANAGER, ROLE_ADMIN);
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
     * @dev returns the network token manager role
     */
    function roleNetworkTokenManager() external pure returns (bytes32) {
        return ROLE_NETWORK_TOKEN_MANAGER;
    }

    /**
     * @dev authorize the right of a caller to withdraw a specific amount of a token to a target
     *
     * requirements:
     *
     * - network token: the caller must have the ROLE_NETWORK_TOKEN_MANAGER or ROLE_ASSET_MANAGER role
     * - other reserve token or ETH: the caller must have the ROLE_ASSET_MANAGER role
     */
    function isAuthorizedWithdrawal(
        address caller,
        Token token,
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return
            (token.isEqual(_networkToken) && hasRole(ROLE_NETWORK_TOKEN_MANAGER, caller)) ||
            hasRole(ROLE_ASSET_MANAGER, caller);
    }
}

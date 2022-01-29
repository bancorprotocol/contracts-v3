// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IVault, ROLE_ASSET_MANAGER } from "./interfaces/IVault.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { IERC20Burnable } from "../token/interfaces/IERC20Burnable.sol";
import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { Utils, AccessDenied, NotPayable, InvalidToken } from "../utility/Utils.sol";

abstract contract Vault is IVault, Upgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, Utils {
    using Address for address payable;
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;

    // the address of the network token
    IERC20 internal immutable _networkToken;

    // the address of the network token governance
    ITokenGovernance internal immutable _networkTokenGovernance;

    // the address of the governance token
    IERC20 internal immutable _govToken;

    // the address of the governance token governance
    ITokenGovernance internal immutable _govTokenGovernance;

    // solhint-disable func-name-mixedcase

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(ITokenGovernance initNetworkTokenGovernance, ITokenGovernance initGovTokenGovernance)
        validAddress(address(initNetworkTokenGovernance))
        validAddress(address(initGovTokenGovernance))
    {
        _networkTokenGovernance = initNetworkTokenGovernance;
        _networkToken = initNetworkTokenGovernance.token();
        _govTokenGovernance = initGovTokenGovernance;
        _govToken = initGovTokenGovernance.token();
    }

    /**
     * @dev initializes the contract and its parents
     */
    function __Vault_init() internal onlyInitializing {
        __Upgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        __Vault_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __Vault_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the asset manager role
     */
    function roleAssetManager() external pure returns (bytes32) {
        return ROLE_ASSET_MANAGER;
    }

    // allows execution only by an authorized operation
    modifier whenAuthorized(
        address caller,
        Token token,
        address payable target,
        uint256 amount
    ) {
        if (!isAuthorizedWithdrawal(caller, token, target, amount)) {
            revert AccessDenied();
        }

        _;
    }

    /**
     * @dev returns whether withdrawals are currently paused
     */
    function isPaused() external view returns (bool) {
        return paused();
    }

    /**
     * @dev pauses withdrawals
     *
     * requirements:
     *
     * - the caller must have the ROLE_ADMIN privileges
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @dev unpauses withdrawals
     *
     * requirements:
     *
     * - the caller must have the ROLE_ADMIN privileges
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    /**
     * @inheritdoc IVault
     */
    function withdrawFunds(
        Token token,
        address payable target,
        uint256 amount
    )
        external
        override
        validAddress(target)
        nonReentrant
        whenNotPaused
        whenAuthorized(msg.sender, token, target, amount)
    {
        if (amount == 0) {
            return;
        }

        if (token.isNativeToken()) {
            // using a regular transfer here would revert due to exceeding the 2300 gas limit which is why we're using
            // call instead (via sendValue), which the 2300 gas limit does not apply for
            target.sendValue(amount);
        } else {
            token.safeTransfer(target, amount);
        }

        emit FundsWithdrawn({ token: token, caller: msg.sender, target: target, amount: amount });
    }

    /**
     * @inheritdoc IVault
     */
    function burn(Token token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        whenAuthorized(msg.sender, token, payable(address(0)), amount)
    {
        if (amount == 0) {
            return;
        }

        if (token.isNativeToken()) {
            revert InvalidToken();
        }

        IERC20 erc20Token = token.toIERC20();

        // allow vaults to burn network and governance tokens via their respective token governance modules
        if (erc20Token == _networkToken) {
            _networkTokenGovernance.burn(amount);
        } else if (erc20Token == _govToken) {
            _govTokenGovernance.burn(amount);
        } else {
            IERC20Burnable(address(erc20Token)).burn(amount);
        }

        emit FundsBurned({ token: token, caller: msg.sender, amount: amount });
    }

    /**
     * @dev returns whether the given caller is allowed access to the given token
     */
    function isAuthorizedWithdrawal(
        address caller,
        Token token,
        address target,
        uint256 amount
    ) internal view virtual returns (bool);

    /**
     * @inheritdoc IVault
     */
    function isPayable() public view virtual returns (bool);

    /**
     * @dev authorize the contract to receive ETH
     *
     * requirements:
     *
     * - isPayable must return true
     */
    receive() external payable {
        if (!isPayable()) {
            revert NotPayable();
        }
    }
}

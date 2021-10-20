// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { Vault } from "../vault/Vault.sol";

contract TestVault is Vault {
    using SafeERC20 for IERC20;
    using ReserveTokenLibrary for ReserveToken;

    bool private _authenticateWithdrawal;
    bool private _payable;

    uint256[MAX_GAP - 1] private __gap;

    function initialize() external initializer {
        __TestVault_init();
    }

    // solhint-disable func-name-mixedcase

    function __TestVault_init() internal initializer {
        __Vault_init();

        __TestVault_init_unchained();
    }

    function __TestVault_init_unchained() internal initializer {}

    function setAuthenticateWithdrawal(bool state) external {
        _authenticateWithdrawal = state;
    }

    function setPayable(bool state) external {
        _payable = state;
    }

    function version() external pure override returns (uint16) {
        return 1;
    }

    function isPayable() public view override returns (bool) {
        return _payable;
    }

    function authenticateWithdrawal(
        address, /* caller */
        ReserveToken, /* reserverToken */
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return _authenticateWithdrawal;
    }
}

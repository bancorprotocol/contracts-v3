// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

import { Vault } from "../vaults/Vault.sol";

contract TestVault is Vault {
    bool private _authorizeWithdrawal;
    bool private _payable;

    uint256[MAX_GAP - 1] private __gap;

    constructor(ITokenGovernance initNetworkTokenGovernance, ITokenGovernance initGovTokenGovernance)
        Vault(initNetworkTokenGovernance, initGovTokenGovernance)
    {}

    function initialize() external initializer {
        __TestVault_init();
    }

    // solhint-disable func-name-mixedcase

    function __TestVault_init() internal onlyInitializing {
        __Vault_init();

        __TestVault_init_unchained();
    }

    function __TestVault_init_unchained() internal onlyInitializing {}

    function setAuthorizedWithdrawal(bool state) external {
        _authorizeWithdrawal = state;
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

    function authorizeWithdrawal(
        address, /* caller */
        ReserveToken, /* reserverToken */
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return _authorizeWithdrawal;
    }
}

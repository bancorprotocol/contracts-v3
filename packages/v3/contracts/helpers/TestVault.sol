// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

import { Vault } from "../vaults/Vault.sol";

contract TestVault is Vault {
    bool private _isAuthorizedWithdrawal;
    bool private _isPayable;

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

    // solhint-enable func-name-mixedcase

    function setAuthorizedWithdrawal(bool state) external {
        _isAuthorizedWithdrawal = state;
    }

    function setPayable(bool state) external {
        _isPayable = state;
    }

    function version() external pure override returns (uint16) {
        return 1;
    }

    function isPayable() public view override returns (bool) {
        return _isPayable;
    }

    function isAuthorizedWithdrawal(
        address, /* caller */
        ReserveToken, /* reserverToken */
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return _isAuthorizedWithdrawal;
    }
}

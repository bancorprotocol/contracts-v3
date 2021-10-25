// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { Upgradeable } from "../utility/Upgradeable.sol";

contract TestUpgradeable is Upgradeable {
    function initialize() external initializer {
        __TestUpgradeable_init();
    }

    // solhint-disable func-name-mixedcase

    function __TestUpgradeable_init() internal initializer {
        __Upgradeable_init();

        __TestUpgradeable_init_unchained();
    }

    function __TestUpgradeable_init_unchained() internal initializer {}

    function version() external pure returns (uint16) {
        return 1;
    }

    function restricted() external view onlyRole(ROLE_ADMIN) {}
}

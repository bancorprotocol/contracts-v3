// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";

contract TestUpgradeable is Upgradeable {
    function initialize() external initializer {
        __TestUpgradeable_init();
    }

    // solhint-disable func-name-mixedcase

    function __TestUpgradeable_init() internal onlyInitializing {
        __Upgradeable_init();

        __TestUpgradeable_init_unchained();
    }

    function __TestUpgradeable_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    function version() public pure override(Upgradeable) returns (uint16) {
        return 1;
    }

    function restricted() external view onlyAdmin {}

    function versionCount() external view returns (uint16) {
        return _versionCount;
    }
}

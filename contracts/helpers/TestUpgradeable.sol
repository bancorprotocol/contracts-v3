// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";

contract TestUpgradeable is Upgradeable {
    uint16 private _version;

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

    function version() public view override(Upgradeable) returns (uint16) {
        return _version;
    }

    function setVersion(uint16 newVersion) external {
        _version = newVersion;
    }

    function versionCount() external view returns (uint16) {
        return _versionCount;
    }

    function setVersionCount(uint16 newVersionCount) external {
        _versionCount = newVersionCount;
    }

    function restricted() external view onlyAdmin {}
}

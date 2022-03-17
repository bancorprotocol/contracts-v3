// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { Upgradeable } from "../utility/Upgradeable.sol";

contract TestLogic is Upgradeable {
    bool private _initializedLogic;
    uint16 private _version;

    uint256[MAX_GAP - 1] private __gap;

    function initialize() external initializer {
        __TestLogic_init();
    }

    // solhint-disable func-name-mixedcase

    function __TestLogic_init() internal onlyInitializing {
        __TestLogic_init_unchained();
    }

    function __TestLogic_init_unchained() internal onlyInitializing {
        _initializedLogic = true;
        _version = 1;
    }

    // solhint-enable func-name-mixedcase

    function initialized() external view returns (bool) {
        return _initializedLogic;
    }

    function version() external view override returns (uint16) {
        return _version;
    }

    function setVersion(uint16 newVersion) external {
        _version = newVersion;
    }
}

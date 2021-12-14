// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { Upgradeable } from "../utility/Upgradeable.sol";

contract TestLogic is Upgradeable {
    bool private _initialized;
    uint16 private _version;

    uint256[MAX_GAP - 1] private __gap;

    function initialize() external initializer {
        __TestLogic_init();
    }

    // solhint-disable func-name-mixedcase

    function __TestLogic_init() internal initializer {
        __TestLogic_init_unchained();
    }

    function __TestLogic_init_unchained() internal initializer {
        _initialized = true;
        _version = 1;
    }

    function initialized() external view returns (bool) {
        return _initialized;
    }

    function version() external view override returns (uint16) {
        return _version;
    }

    function setVersion(uint16 newVersion) external {
        _version = newVersion;
    }
}

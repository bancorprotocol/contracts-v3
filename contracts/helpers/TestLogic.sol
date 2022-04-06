// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Upgradeable } from "../utility/Upgradeable.sol";

contract TestLogic is Upgradeable {
    bool private _initializedLogic;
    uint256 private _data;
    uint16 private immutable _version;

    uint256[MAX_GAP - 1] private __gap;

    event Upgraded(uint16 newVersion, uint256 arg1, bool arg2, string arg3);

    constructor(uint16 initVersion) {
        _version = initVersion;
    }

    function initialize() external initializer {
        __TestLogic_init();
    }

    // solhint-disable func-name-mixedcase

    function __TestLogic_init() internal onlyInitializing {
        __TestLogic_init_unchained();
    }

    function __TestLogic_init_unchained() internal onlyInitializing {
        _initializedLogic = true;

        _data = 100;
    }

    // solhint-enable func-name-mixedcase

    function initialized() external view returns (bool) {
        return _initializedLogic;
    }

    function version() public view override returns (uint16) {
        return _version;
    }

    function data() external view returns (uint256) {
        return _data;
    }

    function setData(uint16 newData) external {
        _data = newData;
    }
}

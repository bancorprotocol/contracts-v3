// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { Time } from "../utility/Time.sol";

contract TestTime is Time {
    uint32 private _currentTime = 1;

    function _time() internal view virtual override returns (uint32) {
        return _currentTime;
    }

    function setTime(uint32 newTime) external {
        _currentTime = newTime;
    }

    function currentTime() external view returns (uint32) {
        return _currentTime;
    }
}

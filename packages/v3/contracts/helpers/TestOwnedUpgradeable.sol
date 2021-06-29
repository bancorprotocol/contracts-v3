// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../utility/OwnedUpgradeable.sol";

contract TestOwnedUpgradeable is OwnedUpgradeable {
    function initialize() external initializer {
        __Owned_init();
    }
}

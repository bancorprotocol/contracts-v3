// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { OwnedUpgradeable } from "../utility/OwnedUpgradeable.sol";

contract TestOwnedUpgradeable is OwnedUpgradeable {
    function initialize() external initializer {
        __Owned_init();
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

/**
 * @dev This contract provides common utilities for upgradeable contracts
 */
abstract contract Upgradeable is Initializable {
    uint32 internal constant MAX_GAP = 50;
}

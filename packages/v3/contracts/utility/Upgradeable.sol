// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import { IUpgradeable } from "./interfaces/IUpgradeable.sol";

/**
 * @dev this contract provides common utilities for upgradeable contracts
 */
abstract contract Upgradeable is IUpgradeable, Initializable {
    uint32 internal constant MAX_GAP = 50;
}

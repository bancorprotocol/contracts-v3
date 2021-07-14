// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

/**
 * @dev an interface for a versioned contract
 */
interface IVersioned {
    function version() external pure returns (uint16);
}

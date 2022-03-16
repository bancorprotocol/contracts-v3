// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

/**
 * @dev an interface for a versioned contract
 */
interface IVersioned {
    function version() external view returns (uint16);
}

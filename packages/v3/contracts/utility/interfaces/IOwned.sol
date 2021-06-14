// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

/**
 * @dev Owned interface
 */
interface IOwned {
    function owner() external view returns (address);

    function transferOwnership(address ownerCandidate) external;

    function acceptOwnership() external;
}

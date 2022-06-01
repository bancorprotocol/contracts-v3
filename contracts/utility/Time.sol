// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

/**
 * @dev this contract abstracts the block timestamp in order to allow for more flexible control in tests
 */
abstract contract Time {
    /**
     * @dev returns the current time
     */
    function _time() internal view virtual returns (uint32) {
        return uint32(block.timestamp);
    }
}

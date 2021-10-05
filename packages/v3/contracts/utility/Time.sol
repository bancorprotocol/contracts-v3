// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

/**
 * @dev time implementing contract
 */
contract Time {
    /**
     * @dev returns the current time
     */
    function _time() internal view virtual returns (uint32) {
        return uint32(block.timestamp);
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

/**
 * @dev time implementing contract
 */
contract Time {
    /**
     * @dev returns the current time
     */
    function _time() internal view virtual returns (uint256) {
        return block.timestamp;
    }
}

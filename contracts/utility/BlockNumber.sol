// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

/**
 * @dev this contract abstracts the block number in order to allow for more flexible control in tests
 */
abstract contract BlockNumber {
    /**
     * @dev returns the current block-number
     */
    function _blockNumber() internal view virtual returns (uint32) {
        return uint32(block.number);
    }
}

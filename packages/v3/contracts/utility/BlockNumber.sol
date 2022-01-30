// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

/**
 * @dev block-number implementing contract
 */
contract BlockNumber {
    /**
     * @dev returns the current block-number
     */
    function _blockNumber() internal view virtual returns (uint32) {
        return uint32(block.number);
    }
}

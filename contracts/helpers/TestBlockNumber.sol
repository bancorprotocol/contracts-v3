// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { BlockNumber } from "../utility/BlockNumber.sol";

contract TestBlockNumber is BlockNumber {
    uint32 private _currentBlockNumber = 1;

    function setBlockNumber(uint32 newBlockNumber) external {
        _currentBlockNumber = newBlockNumber;
    }

    function currentBlockNumber() external view returns (uint32) {
        return _currentBlockNumber;
    }

    function realBlockNumber() external view returns (uint32) {
        return super._blockNumber();
    }

    function _blockNumber() internal view virtual override returns (uint32) {
        return _currentBlockNumber;
    }
}

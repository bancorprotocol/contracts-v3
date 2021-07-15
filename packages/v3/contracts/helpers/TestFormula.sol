// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../utility/Formula.sol";

contract TestFormula {
    using Formula for *;

    function hMax(uint256 b, uint256 c, uint256 d, uint256 e, uint256 n) external pure returns (uint256) {
        return Formula.hMax(b, c, d, e, n);
    }
}

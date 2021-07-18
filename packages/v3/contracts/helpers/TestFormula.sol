// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../utility/Formula.sol";

contract TestFormula {
    using Formula for *;

    function hMaxCondition(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 n,
        uint256 x
    ) external pure returns (bool) {
        return Formula.hMaxCondition(b, c, d, e, n, x);
    }

    function hMaxParts(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 n
    ) external pure returns (Formula.hMax memory) {
        return Formula.hMaxParts(b, c, d, e, n);
    }

    function hMaxR(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n
    ) external pure returns (uint256) {
        return Formula.hMaxR(b, c, e, n);
    }
}

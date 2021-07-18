// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../utility/Formula.sol";

contract TestFormula {
    using Formula for *;

    function hMaxComputable(
        uint256 b,
        uint256 c,
        uint256 e
    ) external pure returns (bool) {
        return Formula.hMaxComputable(b, c, e);
    }

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
    ) external pure returns (Formula.Hmax memory) {
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

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../utility/Formula.sol";

contract TestFormula {
    using Formula for *;

    function withdrawalAmounts(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) external pure returns (Formula.WithdrawalAmounts memory) {
        return Formula.withdrawalAmounts(a, b, c, d, e, m, n, x);
    }

    function maxArbComputable(
        uint256 b,
        uint256 c,
        uint256 e
    ) external pure returns (bool) {
        return Formula.maxArbComputable(b, c, e);
    }

    function maxArbCondition(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 n,
        uint256 x
    ) external pure returns (bool) {
        return Formula.maxArbCondition(b, c, d, e, n, x);
    }

    function maxArbParts(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 n
    ) external pure returns (Formula.MaxArb memory) {
        return Formula.maxArbParts(b, c, d, e, n);
    }

    function maxArbR(
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n
    ) external pure returns (uint256) {
        return Formula.maxArbR(b, c, e, n);
    }

    function optArb(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return Formula.optArb(a, b, f, m);
    }
}

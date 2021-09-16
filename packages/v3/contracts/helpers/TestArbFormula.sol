// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../pools/PoolCollectionFormulas/ArbFormula.sol";

contract TestArbFormula {
    using ArbFormula for *;

    function surplus(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return ArbFormula.surplus(a, b, f, m);
    }

    function deficit(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return ArbFormula.deficit(a, b, f, m);
    }
}

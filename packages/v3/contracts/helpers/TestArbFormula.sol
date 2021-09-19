// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../pools/PoolCollectionFormulas/ArbFormula.sol";

contract TestArbFormula {
    using ArbFormula for *;

    function surplus(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) external pure returns (ArbFormula.Output memory output) {
        return ArbFormula.surplus(a, b, c, e, m, n, x);
    }

    function deficit(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) external pure returns (ArbFormula.Output memory output) {
        return ArbFormula.deficit(a, b, c, e, m, n, x);
    }
}

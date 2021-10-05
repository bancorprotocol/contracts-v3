// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import "../pools/PoolCollectionFormulas/DefaultFormula.sol";

contract TestDefaultFormula {
    function surplus(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) external pure returns (Output memory) {
        return DefaultFormula.surplus(a, b, c, e, n, x);
    }

    function deficit(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 n,
        uint256 x
    ) external pure returns (Output memory) {
        return DefaultFormula.deficit(a, b, c, e, n, x);
    }
}

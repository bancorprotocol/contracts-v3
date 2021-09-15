// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../pools/PoolCollectionFormulas/HmaxFormula.sol";

contract TestHmaxFormula {
    using HmaxFormula for *;

    function surplus(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) external pure returns (bool) {
        return HmaxFormula.surplus(b, c, d, e, m, n, x);
    }

    function deficit(
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 m,
        uint256 n,
        uint256 x
    ) external pure returns (bool) {
        return HmaxFormula.deficit(b, c, d, e, m, n, x);
    }
}

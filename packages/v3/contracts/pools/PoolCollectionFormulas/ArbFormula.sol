// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import { MAX_UINT128, PPM_RESOLUTION } from "../../utility/Constants.sol";
import { MathEx } from "../../utility/MathEx.sol";

/**
 * @dev this library provides mathematical support for TKN withdrawal
 */
library ArbFormula {
    using SafeMath for uint256;

    uint256 private constant M = PPM_RESOLUTION;

    /**
     * @dev returns `af(b(2-m)-f) / (b^2(1-m))` assuming `m` is normalized
     */
    function surplus(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) internal pure returns (uint256) {
        assert(a <= MAX_UINT128);
        assert(b <= MAX_UINT128);
        assert(f <= MAX_UINT128);
        assert(m <= M);
        assert(b >= f);
        return MathEx.mulDivF(a * f, b * (2 * M - m) - f * M, b.mul(b * (M - m)));
    }

    /**
     * @dev returns `af(b(2-m)+f) / (b(b+fm))` assuming `m` is normalized
     */
    function deficit(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) internal pure returns (uint256) {
        assert(a <= MAX_UINT128);
        assert(b <= MAX_UINT128);
        assert(f <= MAX_UINT128);
        assert(m <= M);
        return MathEx.mulDivF(a * f, b * (2 * M - m) + f * M, b.mul(b * M + f * m));
    }
}

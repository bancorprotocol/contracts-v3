// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./MathEx.sol";
import "./Utils.sol";

/**
 * @dev this library provides a set of ???
 */
library Formula {
    using SafeMath for uint256;
    using MathEx for *;

    /**
     * @dev returns `bden(b + c) / {b^3 + b^2(3c - 2e) + b[e^2(n + 1) + c(3c - 4e)] + c(c - e)^2}`
     */
    function hMax(uint256 b, uint256 c, uint256 d, uint256 e, uint256 n) internal pure returns (uint256) {
        uint256 z = b.mul(b);
        z = z.add(b.mul(c).mul(3));
        z = z.add(c.mul(c).mul(3));
        z = z.add(MathEx.mulDivC(e.mul(e), n + PPM_RESOLUTION, PPM_RESOLUTION));
        z = z.add(MathEx.mulDivC(c, c.mul(c).add(e.mul(e)).sub(c.mul(e).mul(2)), b));
        z = z.sub(b.mul(e).mul(2));
        z = z.sub(c.mul(e).mul(4));
        return MathEx.mulDivF(d.mul(e), MathEx.mulDivF(b.add(c), n, PPM_RESOLUTION), z);
    }
}

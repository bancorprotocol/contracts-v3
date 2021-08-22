// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

import "./interfaces/IStakingRewards.sol";
import { MathEx } from "../utility/MathEx.sol";

/**
 * @dev This contract manages the distribution of the staking rewards
 */
contract StakingRewards is IStakingRewards {
    uint256 internal constant LAMBDA_N = 1;
    uint256 internal constant LAMBDA_D = 5000000;
    uint256 internal constant ONE = 1 << 127;

    function reward(uint256 remainingRewards, uint256 numOfBlocksElapsed) internal pure returns (uint256) {
        uint256 n = exp(numOfBlocksElapsed * LAMBDA_N, LAMBDA_D);
        return MathEx.mulDivF(remainingRewards, n - ONE, n);
    }

    /**
      * @dev returns `e ^ (a / b) * ONE`:
      * - Rewrite the input as a sum of binary exponents and a single residual r, as small as possible
      * - The exponentiation of each binary exponent is given (pre-calculated)
      * - The exponentiation of r is calculated via Taylor series for e^x, where x = r
      * - The exponentiation of the input is calculated by multiplying the intermediate results above
      * - For example: e^5.521692859 = e^(4 + 1 + 0.5 + 0.021692859) = e^4 * e^1 * e^0.5 * e^0.021692859
    */
    function exp(uint256 a, uint256 b) internal pure returns (uint256 n) {
        uint256 x = MathEx.mulDivF(ONE, a, b);
        uint256 y;
        uint256 z;

        require(x < ONE * 2, "ERR_EXP_VAL_TOO_HIGH");

        z = y = x % (ONE >> 6); // get the input modulo 2^(-6)
        z = z * y / ONE; n += z * 0xa261d9400; // add y^02 * (14! / 02!)
        z = z * y / ONE; n += z * 0x36209dc00; // add y^03 * (14! / 03!)
        z = z * y / ONE; n += z * 0x0d8827700; // add y^04 * (14! / 04!)
        z = z * y / ONE; n += z * 0x02b4d4b00; // add y^05 * (14! / 05!)
        z = z * y / ONE; n += z * 0x007378c80; // add y^06 * (14! / 06!)
        z = z * y / ONE; n += z * 0x00107ef80; // add y^07 * (14! / 07!)
        z = z * y / ONE; n += z * 0x00020fdf0; // add y^08 * (14! / 08!)
        z = z * y / ONE; n += z * 0x00003aa70; // add y^09 * (14! / 09!)
        z = z * y / ONE; n += z * 0x000005dd8; // add y^10 * (14! / 10!)
        z = z * y / ONE; n += z * 0x000000888; // add y^11 * (14! / 11!)
        z = z * y / ONE; n += z * 0x0000000b6; // add y^12 * (14! / 12!)
        z = z * y / ONE; n += z * 0x00000000e; // add y^13 * (14! / 13!)
        z = z * y / ONE; n += z * 0x000000001; // add y^14 * (14! / 14!)
        n = n / 0x144c3b2800 + y + ONE; // divide by 14! and then add y^1 / 1! + y^0 / 0!

        if ((x & (ONE >> 6)) != 0) n = n * 0x1f80feabfeefa4927d10bdd54ead5aa4c / 0x1f03f56a88b5d7914b00abf97762735d8; // multiply by e^2^(-6)
        if ((x & (ONE >> 5)) != 0) n = n * 0x1f03f56a88b5d7914b00abf97762735d9 / 0x1e0fabfbc702a3ce5e31fe0609358bb05; // multiply by e^2^(-5)
        if ((x & (ONE >> 4)) != 0) n = n * 0x1e0fabfbc702a3ce5e31fe0609358bb06 / 0x1c3d6a24ed82218787d624d3e5eba95fe; // multiply by e^2^(-4)
        if ((x & (ONE >> 3)) != 0) n = n * 0x1c3d6a24ed82218787d624d3e5eba95fe / 0x18ebef9eac820ae8682b9793ac6d1e77b; // multiply by e^2^(-3)
        if ((x & (ONE >> 2)) != 0) n = n * 0x18ebef9eac820ae8682b9793ac6d1e77d / 0x1368b2fc6f9609fe7aceb46aa619baed8; // multiply by e^2^(-2)
        if ((x & (ONE >> 1)) != 0) n = n * 0x1368b2fc6f9609fe7aceb46aa619baed8 / 0x0bc5ab1b16779be3575bd8f0520a9f221; // multiply by e^2^(-1)
        if ((x & (ONE >> 0)) != 0) n = n * 0x0bc5ab1b16779be3575bd8f0520a9f221 / 0x0454aaa8efe072e7f6ddbab84b40a55ca; // multiply by e^2^(+0)
    }
}

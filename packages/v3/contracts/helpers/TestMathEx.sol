// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { MathEx, Uint512 } from "../utility/MathEx.sol";
import { Fraction } from "../utility/Types.sol";

contract TestMathEx {
    function exp(Fraction memory f) external pure returns (Fraction memory) {
        return MathEx.exp(f);
    }

    function mulDivF(
        uint256 x,
        uint256 y,
        uint256 z
    ) external pure returns (uint256) {
        return MathEx.mulDivF(x, y, z);
    }

    function mulDivC(
        uint256 x,
        uint256 y,
        uint256 z
    ) external pure returns (uint256) {
        return MathEx.mulDivC(x, y, z);
    }

    function subMax0(uint256 n1, uint256 n2) external pure returns (uint256) {
        return MathEx.subMax0(n1, n2);
    }

    function mul512(uint256 x, uint256 y) external pure returns (Uint512 memory) {
        return MathEx.mul512(x, y);
    }

    function gt512(Uint512 memory x, Uint512 memory y) external pure returns (bool) {
        return MathEx.gt512(x, y);
    }

    function lt512(Uint512 memory x, Uint512 memory y) external pure returns (bool) {
        return MathEx.lt512(x, y);
    }

    function gte512(Uint512 memory x, Uint512 memory y) external pure returns (bool) {
        return MathEx.gte512(x, y);
    }

    function lte512(Uint512 memory x, Uint512 memory y) external pure returns (bool) {
        return MathEx.lte512(x, y);
    }
}

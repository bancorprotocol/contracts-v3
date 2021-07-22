// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../pools/LiquidityPoolCollection.sol";

contract TestLiquidityPoolCollection is LiquidityPoolCollection {
    constructor(IBancorNetwork initNetwork) LiquidityPoolCollection(initNetwork) {}

    function tknArbitrageTest(
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return super.tknArbitrage(b, f, m);
    }

    function bntArbitrageTest(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return super.bntArbitrage(a, b, f, m);
    }
}

// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import "../pools/LiquidityPoolCollection.sol";

contract TestLiquidityPoolCollection is LiquidityPoolCollection {
    constructor(IBancorNetwork initNetwork) LiquidityPoolCollection(initNetwork) {}

    function baseArbitrageTest(
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return super.baseArbitrage(b, f, m);
    }

    function networkArbitrageTest(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return super.networkArbitrage(a, b, f, m);
    }
}

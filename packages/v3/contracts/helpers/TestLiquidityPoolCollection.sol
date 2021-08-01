// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IPendingWithdrawals } from "../network/interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { LiquidityPoolCollection } from "../pools/LiquidityPoolCollection.sol";

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

    function mint(
        address recipient,
        IPoolToken poolToken,
        uint256 amount
    ) external {
        poolToken.mint(recipient, amount);
    }

    function completeWithdrawalT(
        IPendingWithdrawals pendingWithdrawals,
        bytes32 contextId,
        address provider,
        uint256 id
    ) external returns (uint256) {
        return pendingWithdrawals.completeWithdrawal(contextId, provider, id);
    }
}

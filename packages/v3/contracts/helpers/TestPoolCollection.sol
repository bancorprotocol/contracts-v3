// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IPendingWithdrawals } from "../network/interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { PoolCollection } from "../pools/PoolCollection.sol";

contract TestPoolCollection is PoolCollection {
    constructor(IBancorNetwork initNetwork) PoolCollection(initNetwork) {}

    function withdrawalAmountsTest(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d,
        uint256 e,
        uint256 w,
        uint256 m,
        uint256 n,
        uint256 x
    ) external pure returns (WithdrawalAmounts memory) {
        return super.withdrawalAmounts(a, b, c, d, e, w, m, n, x);
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

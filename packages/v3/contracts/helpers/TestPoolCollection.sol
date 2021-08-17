// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IPendingWithdrawals } from "../network/interfaces/IPendingWithdrawals.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { INetworkTokenPool } from "../pools/interfaces/INetworkTokenPool.sol";
import { PoolCollection, Pool } from "../pools/PoolCollection.sol";
import { AverageRate } from "../pools/PoolAverageRate.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

contract TestPoolCollection is PoolCollection {
    constructor(IBancorNetwork initNetwork) PoolCollection(initNetwork) {}

    function mint(
        address recipient,
        IPoolToken poolToken,
        uint256 amount
    ) external {
        poolToken.mint(recipient, amount);
    }

    function setTradingLiquidityT(
        IReserveToken reserveToken,
        uint128 baseTokenTradingLiquidity,
        uint128 networkTokenTradingLiquidity
    ) external {
        Pool storage data = _pools[reserveToken];
        data.baseTokenTradingLiquidity = baseTokenTradingLiquidity;
        data.networkTokenTradingLiquidity = networkTokenTradingLiquidity;
    }

    function setAverageRateT(IReserveToken reserveToken, AverageRate memory newAverageRate) external {
        Pool storage data = _pools[reserveToken];
        data.averageRate = newAverageRate;
    }

    function baseArbitrageT(
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return super.baseArbitrage(b, f, m);
    }

    function networkArbitrageT(
        uint256 a,
        uint256 b,
        uint256 f,
        uint256 m
    ) external pure returns (uint256) {
        return super.networkArbitrage(a, b, f, m);
    }

    function completeWithdrawalT(
        IPendingWithdrawals pendingWithdrawals,
        bytes32 contextId,
        address provider,
        uint256 id
    ) external returns (uint256) {
        return pendingWithdrawals.completeWithdrawal(contextId, provider, id);
    }

    function requestLiquidityT(
        INetworkTokenPool networkTokenPool,
        bytes32 contextId,
        IReserveToken pool,
        uint256 networkTokenAmount,
        bool skipLimitCheck
    ) external returns (uint256) {
        return networkTokenPool.requestLiquidity(contextId, pool, networkTokenAmount, skipLimitCheck);
    }

    function renounceLiquidityT(
        INetworkTokenPool networkTokenPool,
        bytes32 contextId,
        IReserveToken pool,
        uint256 networkTokenAmount
    ) external {
        networkTokenPool.renounceLiquidity(contextId, pool, networkTokenAmount);
    }
}
